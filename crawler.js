var $ = require('jQuery');
var fs = require('fs');

var BASE_URL = 'https://tech.yandex.ru/maps/doc/jsapi/2.1/ref/reference/';

var hrefExp = /\/maps\/doc\/jsapi\/2\.1\/ref\/reference\/([A-Za-z\.]+)\-docpage\//;

var docs = [];
load('packages.xml', function(data) {
  var dom = $(data);
  var links = $("a.docmenu__link", dom);
  links.each(function() {
    var link = $(this);
    var name = link.html();
    var url = link.attr('href');
    
    var matches = hrefExp.test(url);
    if(!matches) {
      return;
    }
    
    url = matches[1];
    
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
    load(d.url, function(data) {
      counter--;
      var dom = $(data);

      d.def = {};

      // NAME
      d.def.name = $('.b-page-title__title', dom).html();


      // CTOR
      var paramsTable;
      var ctorAnchor = $("#constructor-summary", dom);
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
      }

      // INHERITS
      var inherits = [];
      var inheritLinks = $('.b-dita-text > div > p:contains("Расширяет") > a', dom);
      inheritLinks.each(function() {
        inherits.push($.trim($(this).text()));
      });
      if (inherits.length) {
        d.def.inherits = inherits;
      }

      // METHODS
      var methodsAnchor = $("#methods-summary", dom);
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
      }

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

function load(url, callback) {
  var cachedPath = __dirname + '/cache/' + url;
  if (fs.existsSync(cachedPath)) {
    fs.readFile(cachedPath, 'utf8', function(err, data) {
      console.log('From cache: ' + url);
      if (err) {
        throw err;
      }
      callback(data.toString());
    });
  } else {
    $.get((BASE_URL + url, function(data) {
      console.log('Loaded: ' + url);
      fs.writeFile(cachedPath, data, function(err) {
          if(err) {
              console.log(err);
          } else {
              console.log(url + " put into cache");
          }
      });

      callback(data);
    });
  }
};