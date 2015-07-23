var $ = require('jQuery');
var fs = require('fs');

var BASE_URL = 'https://tech.yandex.ru/maps/doc/jsapi/2.1/ref/reference/';

var hrefExp = /\/maps\/doc\/jsapi\/2\.1\/ref\/reference\/([A-Za-z\.]+)\-docpage\//;

var docs = [];
load('https://tech.yandex.ru/maps/doc/jsapi/2.1/ref/concepts/About-docpage/', function(data) {

  var dom = $(data);
  var links = $("a.docmenu__link", dom);
  
  links.each(function() {
    var link = $(this);
    var name;
    var url = link.attr('href');
    
    var matches = hrefExp.exec(url);
    if(!matches) {
      return true;
    }
    
    url = name = matches[1];
    
    if (url == 'packages.xml') {
      return;
    }
    if (name || url) {
      var alreadyHasDoc = docs.some(function(doc) {
        return doc.url == url;
      });
      if (!alreadyHasDoc) {
        docs.push({
          name: name,
          url: url
        });
      }
    }
  });

  var counter = docs.length;

  var ret = [];
  docs.forEach(function(d) {
    loadDoc(d.url, function(data) {
      counter--;
      /**
       * Страница целиком
       */
      var dom = $(data);
      /**
       * Только контент справки, работать необходимо с этим элементом
       */
      var content = $('.b-dita-text', dom);

      d.def = {};

      // NAME
      d.def.name = $('h1', content).html();

      /**
       * @todo Разобрать страницу по тэгам <h2>, сформировать хэш,
       *       ключами которого будут являться наименования разделов,
       *       а значениями -- контент до следующего <h2> или конца
       *       документа. Кроме того, вычленить часть от начала документа 
       *       до первого <h2>, (возможно, удалить из нее <h1>) использовать
       *       ее для разбора @extends и @inherits
       *       
       *       Затем -- тестировать `parseTable` для таблиц, находящихся
       *       внутри <h2>. Если возвращаемой информации будет недостаточно,
       *       разбирать контент некоторых разделов (напр., "Описание полей",
       *       "Описание методов") по <h3>, и брать сигнатуру метода/поля из 
       *       `div.codeblock:first-child > pre > code.javascript` (для разбора
       *       понадобится новый метод; не первый div.codeblock -- пример 
       *       использования).
       */

      var m;
      var contents = content.html(),
        i = 0,
        regexp = /<h2>(.+)<\/h2>([\s\S]+?)(?=(<h2>.+<\/h2>|($(?!\s))))/gm,
        summary = {};

      while((m = regexp.exec(contents)) != null) {
        if(i === 0) {
          summary['_preface_'] = '<div>' + contents.substring(0, m.index) + '</div>';
        }
        
        summary[ m[1].toLowerCase() ] = '<div>' + m[2] + '</div>';
        i++;
      }

      // CTOR
      var paramsTable;
      if(summary['конструктор']) {
        var $cont = $(summary['конструктор']);
        paramsTable = $('table', $cont);
        if(paramsTable.size()) {
          d.def.ctorParams = parseParamTable(paramsTable);
        }
      }
      
      /*var ctorAnchor = $("#constructor-summary", dom);
      d.def.hasCtor = !!ctorAnchor.length;
      if (d.def.hasCtor) {
        var ctorEl = ctorAnchor.next();

        var paramsHeader = $("strong:contains('Параметры:')", ctorEl);
        if (paramsHeader.length) {
          paramsTable = paramsHeader.parent().next();
          d.def.ctorParams = parseTable(paramsTable);
        }
      } else {
        paramsTable = $('.b-static-text table');
        d.def.params = parseTable(paramsTable);
      }*/

      // INHERITS
      var inherits = [];
      var inheritLinks = $('p:contains("Расширяет") > a', $(summary['_preface_']));
      inheritLinks.each(function() {
        inherits.push($.trim($(this).text()));
      });
      if (inherits.length) {
        d.def.inherits = inherits;
      }
      
      // METHODS
      if(summary['описание методов']) {
        var methodContents = explodeByHeaders(summary['описание методов']);
        d.def.methods = [];
        for(var methodName in methodContents) {
          var m = parseMethod(methodName, methodContents);
          if(m['name']) {
            d.def.methods.push(m);
          }
        }
        
        console.error(d.def.methods);
        process.exit(1);
      }
      /*var methodsAnchor = $("#methods-summary", dom);
      if (!!methodsAnchor.length) {
        var methodsEl = methodsAnchor.next();
        var methodsTable = $('table', methodsEl);
        d.def.methods = parseTable(methodsTable);

        if (d.def.methods.length) {
          d.def.methods.forEach(function(method) {
            var anchor = $('#' + method.name, dom);
            var el = anchor.next();
            var table = $('table', el);
            if (table.length) {
              method.params = parseTable(table);
            }
          });
        }
      }*/

      // PROPERTIES
      var propAnchor = $("#properties-summary", dom);
      if (!!propAnchor.length) {
        var propEl = propAnchor.next();
        var propTable = $('table', propEl);
        d.def.props = parseTable(propTable);
      }

      ret.push(d);
      if (counter == 0) {
        save(ret);
      }
    });

  });

});

function contains(text, selector, context) {
  var els = [];
  $(selector, context || null).each(function() {
    var html = $(this).html();
    if (html.indexOf(text) != -1) {
      els.push(this);
    }
  });
  return $(els);
}

function save(object) {
  var data = JSON.stringify(object, null, 2);
  if (fs.existsSync("data.json")) {
    fs.unlinkSync("data.json");
  }
  fs.writeFile("data.json", data, function(err) {
      if(err) {
          console.log(err);
      } else {
          console.log("The file was saved!");
      }
  });
}

function parseTable(table) {
  var rows = [];
  var keys = [];
  $('th', table).each(function() {
    var strKey = $.trim($(this).html());
    switch(strKey) {
      case 'Имя':
        keys.push('name');
      break;
      case 'Параметр':
        keys.push('param');
      break;
      case 'Возвращает':
        keys.push('return');
      break;
      case 'Тип':
        keys.push('type');
      break;
      case 'Описание':
        keys.push('description');
      break;
      case 'Свойства параметра':
        keys.push('property');
      break;
      default:
        keys.push('required');
      break;
    }
  });


  $('tr', table).each(function() {
    var row = {};
    var tds = $('td', this);
    if (tds.length != keys.length) {
      return;
    }
    tds.each(function(pos) {
      if (keys[pos] == 'required') {
        row[keys[pos]] = !!$('img', this).length;
      } else {
        row[keys[pos]] = $.trim($(this).text()).replace(/\s{2,}/g, ' ').replace(/\n/g, ' ');
      }
    });
    rows.push(row);
  });

  var ret = [];
  rows.forEach(function(row) {
    if (row.name) {
      row.name = row.name.replace(/\(.*?\)/, '');
      ret.push(row);
    } else if (row.param) {
      row.param = row.param.replace(/\|/g, '__');
      ret.push(row);
    } else if (row.property) {
      var parent = ret[ret.length - 1];
      if (!parent) {
        throw Error('There is no parent for property for row: '+ "\n" + JSON.stringify(row, null, 2));
      }
      if (!parent.properties) {
        parent.properties = [];
      }

      // if (row.property.indexOf('.') != -1) {
      //   var property = row.property.split('.');
      //   row.property = row.property.replace(/.+\.(.+)/, '$1');
      //   if (!parent || parent.name != property[0]) {
      //     parent = {
      //       param: property[0],
      //       type: 'Object',
      //       properties: []
      //     };
      //     ret.push(parent);
      //   }
      // }

      row.param = row.property.replace(/\|/g, '__');
      delete row.property;
      parent.properties.push(row);
    }
  });

  return ret;
};

/**
 * Разбирает таблицу описания аргументов метода (используется для методов и 
 * конструкторов), состоящую из трех столбцов: "Параметр", "Значение 
 * по умолчанию", "Описание".
 * 
 * Данные столбца "Параметр" используются для получения наименования переменной
 * аргумента, обязательности.
 * 
 * Данные столбца "Описание" используются для получения типа передаваемых данных
 * и текстового описания параметра.
 * 
 * Столбец "Значение по умолчанию" не используется. Игнорируются аргументы,
 * содержащие в наименовании переменной точку (т.е. расшифровка свойств 
 * передаваемого аргумента типа {Object}).
 * 
 * @param {jQuery} table
 * @returns {Array}
 */
function parseParamTable(table) {

  var cols = {};
  $('th', table).each(function(i) {
    cols[$(this).html().toLowerCase()] = i;
  });
  
  if(typeof(cols['параметр']) === 'undefined' || 
      typeof(!cols['описание']) === 'undefind') {
    
    throw Error('Can not find columns of param or description');
  }
  
  var res = [];
  
  $('tr', table).each(function() {
    var tds = $('td', this);
    if(!tds.size()) {
      return;
    }
    
    var paramTd = tds.eq(cols['параметр']);
    var descTd = tds.eq(cols['описание']);
    
    var p = {};
    
    $.extend(p, parseParamCell(paramTd));
    if(typeof(p.param) === 'undefined') {
      return true;
    }
    
    $.extend(p, parseParamDescCell(descTd));
    if(typeof(p.type) === 'undefined') {
      return true;
    }
    
    res.push(p);
  });
  
  return res;
};

/**
 * @param {jQuery} cell
 * @returns {Object.<param,isRequired>}
 */
function parseParamCell(cell) {
  var res = {};
  
  var name = $('span.tag', cell);
  if(!name.size()) {
    throw Error('Can not find span.tag of argument name');
  }
  
  var argName = name.html();
  if(argName.indexOf('.') >= 0) {
    return res;
  }
  var req = $('span.b-doc-pseudo-link', cell);
  
  res.isRequired = !!req.size();
  res.param = argName;
  
  return res;
};

/**
 * @param {jQuery} cell
 * @returns {Object.<type,description>}
 */
function parseParamDescCell(cell) {
  var res = {};
  
  var pType = $('p:contains("Тип:")', cell);
  if(!pType.size()) {
    return res;
  }
  
  var typeStr = stripTags(pType.html());
  typeStr = $.trim(typeStr.replace('Тип:', ''));
  typeStr = formatTypeString(typeStr);
  
  res.type = typeStr;
  
  var pDesc = $('p', cell).not(pType).not(':empty').eq(0);
  if(pDesc.size()) {
    res.description = stripTags(pDesc.html());
  }
  
  return res;
};

/**
 * @param {string} methodName
 * @param {string} methodContents
 * @returns {Object}
 */
function parseMethod(methodName, methodContents) {
  var $cont = $(methodContents);
  
  var res = {};
  var $codeblock = $('div.codeblock:eq(0) > pre > code.javascript', $cont);
  if($codeblock.size()) {
    var codeblockContents = stripTags($codeblock.html());
    console.error(codeblockContents);
    $.extend(res, parseMethodCodeblock(methodName, codeblockContents));
  }
 
  var $table = $('table', $cont);
  if($table.size()) {
    var p = parseParamTable($table);
    if(p.length > 0) {
      res['params'] = p;
    }
  }
  
  res['name'] = methodName;
  
  return res;
};

/**
 * @param {string} methodName
 * @param {string} methodCodeblockContents
 * @returns {Object.<return>}
 */
function parseMethodCodeblock(methodName, methodCodeblockContents) {
  var res = {};
  
  var m = methodCodeblockContents.match(/\{([^\}]+)\}/i);
  if(m) {
    res['return'] = formatTypeString(m[1]);
  }
  
  return res;
};

function parsePropertyCodeblock(codeblock) {
  
};

/**
 * @param {string} typeStr
 * @returns {string}
 */
function formatTypeString(typeStr) {
  return typeStr.replace(/\s*\|\s*/gi, '|');
};

/**
 * Loads url if it is given or loading docpage if `url` is name of doc item.
 * 
 * @param {string} url
 * @param {function(string)} callback
 */
function load(url, callback) {
  if(!url.match(/^http/)) {
    return loadDoc(url, callback);
  }
  
  $.get(url, function(data) {
    console.log('Loaded url:', url);
    callback(data);
  });
};

/**
 * @param {string} docPage Name of documentation item
 * @param {function(string)} callback
 */
function loadDoc(docPage, callback) {
  var cachedPath = __dirname + '/cache/' + docPage;
  if (fs.existsSync(cachedPath)) {
    fs.readFile(cachedPath, 'utf8', function(err, data) {
      console.log('From cache: ' + docPage);
      if (err) {
        throw err;
      }
      callback(data.toString());
    });
  } else {
    $.get((BASE_URL + docPage + '-docpage/'), function(data) {
      console.log('Loaded docpage: ' + docPage);
      fs.writeFile(cachedPath, data, function(err) {
          if(err) {
              console.log(err);
          } else {
              console.log(docPage + " put into cache");
          }
      });

      callback(data);
    });
  }
};

/**
 * @param {string} str
 * @returns {string}
 */
function stripTags(str) {
  return str.replace(/<[^>]+>/gi, '');
};

/**
 * @param {string} htmlString
 * @param {string=} opt_headerTag Default h3
 * @returns {Object.<string, string>}
 */
function explodeByHeaders(htmlString, opt_headerTag) {
  
  var tag = opt_headerTag || 'h3';
  var exp = new RegExp(('<' + tag + '>(.+)<\/' + tag + '>([\\s\\S]+?)(?=(<' + 
    tag + '>.+<\/' + tag + '>|($(?!\\s))))'), 'gim');
  var res = {};
  var m;
    
  while((m = exp.exec(htmlString)) != null) {
    res[ m[1] ] = '<div>' + m[2] + '</div>';
  }
  
  return res;
};