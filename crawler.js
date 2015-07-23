var $ = require('jQuery');
var fs = require('fs');

var BASE_URL = 'https://tech.yandex.ru/maps/doc/jsapi/2.1/ref/reference/';

var hrefExp = /\/maps\/doc\/jsapi\/2\.1\/ref\/reference\/([A-Za-z\.]+)\-docpage\//;

var docs = [];
load('https://tech.yandex.ru/maps/doc/jsapi/2.1/ref/concepts/About-docpage/', function(data) {

  var dom = $(data);
  var links = $("a.docmenu__link", dom);
  var toParse = {};
  
  links.each(function() {
    var link = $(this);
    var url = link.attr('href');
    
    var matches = hrefExp.exec(url);
    if(!matches) {
      return;
    }
    
    url = matches[1];
    
    if (url == 'packages.xml') {
      return;
    }
    if (url) {
      toParse[url] = true;
    }
  });

  var ret = [];
  var urls = Object.keys(toParse);
  
  urls.forEach(function(url) {
    /** @type {Object} */
    var doc = {
      "name": url,
      "url": url
    };
    docs.push(doc);
    
    loadDoc(url, function(data) {
      /**
       * Страница целиком
       */
      var dom = $(data);
      /**
       * Только контент справки, работать необходимо с этим элементом
       */
      var content = $('.b-dita-text', dom);

      doc.def = {};

      // NAME
      doc.def.name = $('h1', content).html();

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
      
      var $preface = (summary['_preface_']) ? $(summary['_preface_']) : content;

      // CTOR
      var paramsTable;
      if(summary['конструктор']) {
        var $cont = $(summary['конструктор']);
        paramsTable = $('table', $cont);
        doc.def.hasCtor = true;
        if(paramsTable.size()) {
          doc.def.ctorParams = parseParamTable(paramsTable);
        }
      } else {
        doc.def.hasCtor = false;
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
      var inheritLinks = $('p:contains("Расширяет") > a', $preface);
      inheritLinks.each(function() {
        inherits.push($.trim($(this).text()));
      });
      if (inherits.length) {
        doc.def.inherits = inherits;
      }
      
      // METHODS
      if(summary['описание методов']) {
        var methodContents = explodeByHeaders(summary['описание методов']);
        doc.def.methods = [];
        for(var methodName in methodContents) {
          var m = parseMethod(methodName, methodContents[methodName]);
          if(m['name']) {
            doc.def.methods.push(m);
          }
        }
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
      if(summary['описание полей']) {
        var propertyContents = explodeByHeaders(summary['описание полей']);
        doc.def.props = [];
        for(var propertyName in propertyContents) {
          var p = parseProperty(propertyName, propertyContents[propertyName]);
          if(p['name']) {
            doc.def.props.push(p);
          }
        }
      }
      /*
      var propAnchor = $("#properties-summary", dom);
      if (!!propAnchor.length) {
        var propEl = propAnchor.next();
        var propTable = $('table', propEl);
        d.def.props = parseTable(propTable);
      }
      */
     
     /**
      * Если нет информации о конструкторе, наследовании, методах и свойствах
      * -- это функция или экземлпяр класса
      */
      if(!doc.def.hasCtor && !doc.def.inherits && !doc.def.methods && 
          !doc.def.props) {
        
        var $table = $("strong:contains('Параметры:')", $preface).parent().next('table');
        if($table.size()) {
          try {
            doc.def.params = parseParamTable($table);
          } catch(e) {
            console.error(e.message, doc, $table.html());
            throw e;
          }
        }
        
        var $returns = $('p:contains("Возвращает")', $preface);
        if($returns.size()) {
          var returnsContent = stripTags($returns.eq(0).html());
          var m = returnsContent.match(/\(тип\s+([^\)]+)\)/i);
          if(m && m[1]) {
            doc.def['return'] = $.trim(m[1]);
          }
        }
        
        if(!doc.def.params && !doc.def['return']) {
          var $instance = $('p:contains("Экземпляр класса") > a', $preface);
          if($instance.size()) {
            doc.def.type = stripTags($instance.html());
          }
        }
      }
      
      var desc = parseDescription($preface);
      if(desc) {
        doc.def.description = desc;
      }

      ret.push(doc);
      delete toParse[doc.url];
      
      var counter = Object.keys(toParse).length;
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
          console.error(err);
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
    $.extend(res, parseMethodCodeblock(methodName, codeblockContents));
  }
 
  var $table = $('table', $cont);
  if($table.size()) {
    var p = parseParamTable($table);
    if(p.length > 0) {
      res['params'] = p;
    }
  }
  
  var desc = parseDescription($cont);
  if(desc) {
    res['desciption'] = desc;
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

/**
 * 
 * @param {string} propName
 * @param {string} propertyContents
 * @returns {Object}
 */
function parseProperty(propName, propertyContents) {
  var $cont = $(propertyContents);
  var res = {};
  
  var $codeblock = $('div.codeblock:eq(0) > pre > code.javascript', $cont);
  if($codeblock.size()) {
    var codeblockContents = stripTags($codeblock.html());
    $.extend(res, parsePropertyCodeblock(propName, codeblockContents));
  }
  
  var desc = parseDescription($cont);
  if(desc) {
    res['description'] = desc;
  }
  
  res['name'] = propName;
  
  return res;
};

/**
 * @param {string} propName
 * @param {string} codeblock
 * @returns {Object.<type>}
 */
function parsePropertyCodeblock(propName, codeblock) {
  var res = {};
  
  var exp = new RegExp(('\\s+' + propName + '$'), 'i');
  var type = $.trim(codeblock.replace(exp, ''));
  if(type) {
    res['type'] = formatTypeString(type);
  }
  
  return res;
};

/**
 * @param {jQuery} $content
 * @returns {string}
 */
function parseDescription($content) {
  var desc = [];
  $content.find('p:not(:empty)').each(function() {
    var $this = $(this);
    if($this.is(':has(div.codeblock)')) {
      return;
    }
    
    if($this.is(':contains("Параметры:")') || $this.is(':contains("Пример:")')) {
      return false;
    }
    
    desc.push(stripTags($this.html()));
  });
  if(desc.length > 0) {
    return desc.join("\n\n");
  }
  
  return '';
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
        console.error('Error reading file from cache', err);
        throw err;
      }
      callback(data.toString());
    });
  } else {
    $.ajax({
      "dataType": "html",
      "error": function(jqXhr, textStatus, e) {
        console.error('Error loading', docPage, e);
      },
      "method": "GET",
      "success": function(data) {
        console.log('Loaded docpage: ' + docPage);
        fs.writeFile(cachedPath, data, function(err) {
          if(err) {
              console.error(err);
          } else {
              console.log(docPage + " put into cache");
          }
        });

        callback(data);
      },
      "url": (BASE_URL + docPage + '-docpage/')
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