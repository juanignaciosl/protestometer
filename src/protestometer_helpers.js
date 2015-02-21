function sqlApi(credentials) {
  function sqlApiPrivateUrl() {
    return sqlApiUrl() + '?api_key=' + credentials.api_key;
  }

  function sqlApiUrl() {
    return 'https://' + credentials.user_name + '.cartodb.com/api/v2/sql';
  }

  function query(url, sqlQuery, callback, errorCallback) {
    $.ajax({
      type: 'POST',
      url: url,
      crossDomain: true,
      data: { q: sqlQuery },
      dataType: 'json',
      success: function(responseData, textStatus, jqXHR) {
        callback(responseData);
      },
      error: function(responseData, textStatus, errorThrown) {
        errorCallback(responseData);
      }
    });
  }

  return {
    publicQuery: function(sqlQuery, callback, errorCallback) {
      query(sqlApiUrl(), sqlQuery, callback, errorCallback);
    },
    query: function(sqlQuery, callback, errorCallback) {
      query(sqlApiPrivateUrl(), sqlQuery, callback, errorCallback);
    }
  }

}

function byId(id) {
  return document.getElementById(id);
}

function createDiv(id, className) {
  return createElement('div', id, className);
}

function createElement(tag, id, className) {
  var element = document.createElement(tag);
  element.id = id;
  element.className = (typeof className === 'undefined') ? '' : className;
  return element;
}

function appendChildDiv(parent, suffix, className) {
  var child = createDiv(generateId(parent, suffix), className);
  parent.appendChild(child);
  return child;
}

function appendChild(tag, parent, suffix, className) {
  var child = createElement(tag, generateId(parent, suffix), className);
  parent.appendChild(child);
  return child;
}

function generateId(parent, suffix) {
  return idFragment(parent.id) + '-' + idFragment(suffix);
}

function idFragment(value) {
  return typeof value === 'undefined' ? randomId() : value;
}

function randomId() {
  return Math.floor(Math.random() * 10000);
}

function clearChilds(element) {
  while(element.childNodes.length > 0) {
    element.removeChild(element.firstChild);
  }
}
