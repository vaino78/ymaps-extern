var fs = require('fs');

var data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
data.sort(function(a, b) {
  var aInt = isInterface(a.name),
   bInt = isInterface(b.name);
   
  if(aInt != bInt) {
    return (aInt) ? -1 : 1;
  }
  
  var aInh = (a.def.inherits ? a.def.inherits.length : 0),
    bInh = (b.def.inherits ? b.def.inherits.length : 0);
    
  if(aInh != bInh) {
    return (aInh < bInt) ? -1 : 1;
  }
  
  var aParts = a.name.split('.'),
    bParts = b.name.split('.');
    
  var al = aParts.length, 
    bl = bParts.length;
    
  if(al != bl) {
    return (al < bl) ? -1 : 1;
  }
  
  for(var i = 0; i < al; i++) {
    if(aParts[i] == bParts[i]) {
      continue;
    }
    
    return aParts[i].localeCompare(bParts[i]);
  }
  
  return 0;
});

var NS = 'ymaps';
var NS_PREFIX = NS + '.';

var ret = '';
ret += [
  '',
  '/**',
  ' * @fileoverview Autogenerated extern for Yandex maps v2.1.',
  ' * @externs',
  ' */',
  '',
  '/**',
  ' * @typedef {Object}',
  ' */',
  'var ' + NS + ' = {};', '', ''
].join("\n");

var rendered = {};
rendered['__ctor__' + 'ymaps'] = true;

var names = [];
data.forEach(function(item) {
  names.push(item.name);
});
names.sort(function(a, b) {
  return b.length - a.length;
});

var namesRegex = new RegExp('(' +names.join("|").replace(/\./g, '\\.') + ')', 'g');

/**
 * Объект, хранящий данные сигнатур свойств и методов интерфейсов (с учетом 
 * наследования интерфейсов) для дополнения сигнатур классов, реализующих 
 * данные интерфейсы
 * 
 * @type {Object}
 */
var interf = {};
data.forEach(function(item) {
  if(isInterface(item.name)) {
    interf[ item.name ] = JSON.parse(JSON.stringify(item.def || {})); // clone...
  }
});

Object.keys(interf).forEach(function(i) {
  var inherits = [];
  inheritsPad(i, inherits);
  
  if(!inherits.length) {
    return;
  }
  
  var props = {},
    methods = {};
    
  if(interf[i].methods) {
    interf[i].methods.forEach(function(m) {
      methods[m] = 1;
    });
  }
  
  if(interf[i].props) {
    interf[i].props.forEach(function(p) {
      props[p] = 1;
    });
  }
  
  inherits.forEach(function(inh) {
    if(interf[inh].methods) {
      interf[inh].methods.forEach(function(m) {
        if(!methods[m.name]) {
          var mm = JSON.parse(JSON.stringify(m));
          if(!mm['inheritsFrom']) {
            mm['inheritsFrom'] = inh;
          }
          if(typeof(interf[i].methods) === 'undefined') {
            interf[i].methods = [];
          }
          interf[i].methods.push(mm);
          methods[mm.name] = 1;
        }
      });
    }
    if(interf[inh].props) {
      interf[inh].props.forEach(function(p) {
        if(!props[p.name]) {
          var pp = JSON.parse(JSON.stringify(p));
          if(!pp['inheritsFrom']) {
            pp['inheritsFrom'] = inh;
          }
          if(typeof(interf[i].props) === 'undefined') {
            interf[i].props = [];
          }
          interf[i].props.push(pp);
          props[pp.name] = 1;
        }
      });
    }
  });
});

//console.error(JSON.stringify(interf, null, 2));
//process.exit(1);

data.forEach(function(item) {
  var r = [];
  
  var nameParts = item.name.split('.');
  nameParts.pop();
  var namePart = '';
  nameParts.forEach(function(np) {
    if(namePart != '') {
      namePart += '.';
    }
    namePart += np;
    if(!rendered['__ctor__' + namePart]) {
      r.push('', (NS_PREFIX + namePart + ' = {};'), '');
      rendered['__ctor__' + namePart] = true;
    }
  });

  r.push('/**');
  
  // DESCRIPTION
  if(item.def.description) {
    r.push(' * ', (' * ' + parseDescription(item.def.description)), ' * ');
  }
  
  var isItemInterface = false;

  // CTOR 
  var prototypeSep = '.';
  if (item.def.hasCtor || item.def.inherits) {
    if (isInterface(item.name)) {
      r.push(' * @interface');
      isItemInterface = true;
    } else {
      r.push(' * @constructor');
    }
    
    prototypeSep += 'prototype.';
  }
  
  var interfacesToPad = [];
  
  if (item.def.inherits) {
    item.def.inherits.forEach(function(parentName) {
      var prefix = '';
      if(parentName.match(namesRegex)) {
        prefix += NS_PREFIX;
      }
      if (isInterface(parentName) && !isItemInterface) {
        r.push(' * @implements {' + prefix + parentName + '}');
        interfacesToPad.push(parentName);
      } else {
        r.push(' * @extends {' + prefix + parentName + '}');
      }
    });
  }
  
  if(prototypeSep !== '.') {
    r.push(' * ');
  }
  
  //PARAMS
  var ctorParamsList = [];
  if ((item.def.ctorParams || item.def.params) && !rendered['__ctor__' + item.name]) {
    var prevParamIsRequired = true;
    (item.def.ctorParams || item.def.params).forEach(function(p) {
      ctorParamsList.push(p.param);
      var paramString = ('@param {' + normilizeType(p.type, 
        (p.isRequired && prevParamIsRequired)) + '} ' + p.param + ' ');
      var paramDesc = '';
      if(p.description) {
        paramDesc =  parseDescription(p.description, paramString.length);
      }
      r.push(' * ' + paramString + paramDesc);
      prevParamIsRequired = p.isRequired;
    });
    rendered['__ctor__' + item.name] = true;
  }
  
  if(item.def['return']) {
    r.push(' * ', (' * @returns {' + normilizeType(item.def['return'], true) + '}'));
  }
  
  if(item.def['type']) {
    r.push(' * ', (' * @type {' + normilizeType(item.def.type, true) + '}'));
  }
  
  var finish = '';
  if(prototypeSep !== '.' || ctorParamsList.length > 0 || item.def['return']) {
    finish = ' = function(' + ctorParamsList.join(', ') + ') {}';
  } else if(item.def.methods || item.def.props || !item.def['type']) {
    finish = ' = {}';
  }

  r.push(' */');
  r.push(NS_PREFIX + item.name + finish + ';');
  r.push('', '');
  
  var fMethods = [], fProps = [];

  // METHODS
  if (item.def.methods) {
    item.def.methods.forEach(function(p) {
      fMethods.push(p);
    });
  }
  
  // PROPERTIES
  if (item.def.props) {
    item.def.props.forEach(function(p) {
      fProps.push(p);
    });
  }
  
  if(interfacesToPad) {
    interfacesToPad.forEach(function(ip) {
      if(interf[ip]) {
        if(interf[ip].methods) {
          interf[ip].methods.forEach(function(ipm) {
            fMethods.push(ipm);
          });
        }
        if(interf[ip].props) {
          interf[ip].props.forEach(function(ipp) {
            fProps.push(ipp);
          });
        }
      }
    });
  }
  
  if(fMethods.length > 0) {
    fMethods.forEach(function(p) {
      if (rendered['__param__' + item.name + '.' + p.name]) {
        return;
      }
      rendered['__param__' + item.name + '.' + p.name] = true;

      var paramsList = [];
      r.push('/**');
      if (p.description) {
        r.push((' * ' + parseDescription(p.description)), ' * ');
      }
      
      if(p.inheritsFrom) {
        r.push((' * @see ' + normilizeType(p.inheritsFrom, true)), 
          ' * @override', ' * ');
      }
      
      if (p.params) {
        p.params.forEach(function(p) {
          paramsList.push(p.param);
          var paramString = ('@param {' + normilizeType(p.type, p.isRequired) + '} ' + p.param + ' ');
          var paramDesc = '';
          if(p.description) {
            paramDesc =  parseDescription(p.description, paramString.length);
          }
          r.push(' * ' + paramString + paramDesc);
        });
      }
      if (p['return']) {
        r.push(' * @return {' + normilizeType(p['return'], true) + '}');
      }
      r.push(' */');
      if (r.length == 2) {
        r = [];
      }
      r.push(NS_PREFIX + item.name + prototypeSep + p.name + ' = function(' + paramsList.join(', ') + ') {};');
      r.push('', '');
    });
  }

  if (fProps.length) {
    fProps.forEach(function(p) {
      if (rendered['__prop__' + item.name + '.' + p.name]) {
        return;
      }
      rendered['__prop__' + item.name + '.' + p.name] = true;

      var paramsList = [];
      r.push('/**');
      if (p.description) {
        r.push((' * ' + parseDescription(p.description)), ' * ');
      }
      if(p.inheritsFrom) {
        r.push((' * @see ' + normilizeType(p.inheritsFrom, true)), ' * ');
      }
      if (p.type) {
        r.push(' * @type {' + normilizeType(p.type, true) + '}');
      }
      r.push(' */');
      if (r.length == 2) {
        r = [];
      }
      r.push(NS_PREFIX + item.name + prototypeSep + p.name + ';');
      r.push('', '');
    });
  }

  ret += r.join("\n");
});

if (fs.existsSync("extern.ymaps.js")) {
  fs.unlinkSync("extern.ymaps.js");
}

fs.writeFile("extern.ymaps.js", ret, function(err) {
    if(err) {
        console.log(err);
    } else {
        console.log("The file was saved!");
    }
});

/**
 * @param {string} str
 * @param {boolean} isRequired
 * @returns {string}
 */
function normilizeType(str, isRequired) {
  str = str.replace(namesRegex, NS_PREFIX + "$1");
    
  var type = str.split('|');
  for (var i = 0, l = type.length; i < l; i++) {
    type[i] = type[i].replace(/^Integer(?=($|\[))/g, "number")
      .replace(/^Number(?=($|\[))/g, "number")
      .replace(/^String(?=($|\[))/g, "string")
      .replace(/^Boolean(?=($|\[))/g, "boolean")
      .replace(/^Null(?=($|\[))/g, "null");
    
    while ((/\[\]$/).test(type[i])) {
      type[i] = 'Array.<' + type[i].replace(/\[\]((\[\])*)$/, '>$1');
    }
  }

  return (type.join('|') || '*') + (isRequired ? '' : '=');
};

/**
 * @param {string} str
 * @returns {boolean}
 */
function isInterface(str) {
  return str.length > 1 && str[0] == 'I' && str[1] == str[1].toUpperCase();
};

/**
 * @param {string} interfaceName
 * @param {Array.<string>} padInto
 */
function inheritsPad(interfaceName, padInto) {
  if(interf[interfaceName] && interf[interfaceName].inherits) {
    interf[interfaceName].inherits.forEach(function(inh) {
      padInto.push(inh);
      inheritsPad(inh, padInto);
    });
  }
};

/**
 * @param {string} desc
 * @param {number=} opt_padSpaces
 * @param {string=} opt_prefix
 * @returns {string}
 */
function parseDescription(desc, opt_padSpaces, opt_prefix) {
  var padSpaces = opt_padSpaces || 0;
  var prefix = opt_prefix || ' * ';
  
  var separator = "\n" + prefix + (new Array(padSpaces + 1).join(' '));
  
  return desc.split('\n').join(separator);
};