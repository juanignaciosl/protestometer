var LABELS = {
  TITLE: 'Protest-o-meter',
  ENTER_PROTEST_NAME: 'Enter new protest name',
  LIST_TITLE: '... or pick an existing protest',
  DENSITY_OPTION_TITLE: 'Click to choose density',
  PERMISSION_HINT: 'Please go to your CartoDB account and make that table public'
}

function hints(error) {
  var hints = [];
  if(error.indexOf('permission denied for relation') != -1) {
    hints.push(LABELS.PERMISSION_HINT);
  }
  return hints;
}

function errorCallback(response) {
  if(typeof response === 'string') {
    alert(response);
  } else {
    console.log(response);
    var errors = JSON.parse(response.responseText).error;
    var errorsText = errors.join('. ');
    alert(response.statusText + " - " + errorsText + '. ' +  hints(errorsText).join('. '));
  }
}

function initProtestometer(credentials, parentId) {
  protestometerService(credentials).load(function(service) {
    initProtestometerApp(service, parentId);
  }, errorCallback);
}

function initProtestometerApp(service, parentId) {
  var parent = byId(parentId);
  parent.className = 'protestometer';
  
  var protestometerContainer = appendChildDiv(parent, 'protestometer', 'protestometer');

  var editor = createProtestEditor(service, function() {
    initialProtestPicker.show();
  }, errorCallback);
  protestometerContainer.appendChild(editor.element);
  editor.init();

  var initialProtestPicker = createInitialProtestPicker(service, function(protest) {
    editor.loadProtest(protest);
  });
  protestometerContainer.appendChild(initialProtestPicker.element);
}

function createInitialProtestPicker(service, callback) {
  var protestPicker = createDiv('initial-protest-picker', 'protest-picker');
  var title = appendChild('h1', protestPicker);
  title.innerText = LABELS.TITLE;

  var protestNameLabel = appendChild('label', protestPicker);
  protestNameLabel.innerText = LABELS.ENTER_PROTEST_NAME;

  var protestNameInput = appendChild('input', protestNameLabel);
  protestNameInput.type = 'text';
  protestNameInput.onkeyup = function() {
    newProtestButton.disabled = protestNameInput.value.length == 0;
  }

  var newProtestButton = appendChild('button', protestPicker);
  newProtestButton.innerText = 'Create new Protest';
  newProtestButton.disabled = true;
  newProtestButton.onclick = function() {
    service.newProtest(protestNameInput.value, function(protest) {
      initialProtestPicker.selectProtest(protest);
      service.loadProtests(reloadProtestList);
    });
  }

  var protestListContainer = appendChildDiv(protestPicker);

  function reloadProtestList(protests) {
    clearChilds(protestListContainer);
    if(protests.length == 0) {
      return;
    }

    var listTitle = appendChild('h2', protestListContainer);
    listTitle.innerText = LABELS.LIST_TITLE;

    function appendProtest(protestList, protest) {
      var protestItem = appendChild('li', protestList, protest['id']);
      protestItem.innerText = protest['name'];
      protestItem.onclick = function() {
        initialProtestPicker.selectProtest(protest);
      }
    }

    var protestList = appendChild('ul', protestListContainer, 'list', 'protest-list');
    for(var p = 0; p < protests.length; p++) {
      appendProtest(protestList, protests[p]);
    }

  };
  service.loadProtests(reloadProtestList);

  var initialProtestPicker = {
    element: protestPicker,
    show: function() {
      protestPicker.style.display = 'block';
    },
    hide: function() {
      protestPicker.style.display = 'none';
    },
    selectProtest: function(protest) {
      initialProtestPicker.hide();
      callback(protest);
    }
  };

  return initialProtestPicker;
}

function createProtestEditor(service, callback, errorCallback) {
  var protestEditor = createDiv('editor', 'protest-editor');
  var map = null;
  var editor = {
    element: protestEditor,
    layers: [],
    init: function() {
      loadMap(protestEditor, function(theMap) {
        map = theMap;
      });
    },
    loadProtest: function(protest) {
      editor.clearLayers();
      title.innerText = protest.name;
      editor.protest = protest;
      protest.densities = editor.densities;
      editor.loadProtestLayer(protest);
    },
    loadProtestLayer: function(protest) {
      service.loadProtestLayer(protest, map, function(layer) {
        editor.addProtestLayer(protest, layer);
      });
    },
    addProtestLayer: function(protest, layer) {
      editor.layers.push(layer);
    },
    clearLayers: function() {
      while(editor.layers.length > 0) {
        map.removeLayer(editor.layers.pop());
      }
    }
  };

  function loadMap(container, callback) {
    var mapContainer = appendChildDiv(container, 'map', 'map-container');

    var mapDiv = appendChildDiv(mapContainer, 'leaflet-map');
    initMap(mapDiv, function(map) {
      var v = cdb.vis.Overlay.create('search', map.viz, {})
      v.show();
      container.appendChild(v.render().el);

      enableDrawing(map);
      map.on('draw:created', onDrawCreated);
      callback(map);
    });
  }

  function initMap(mapDiv, callback) {
    var id = mapDiv.id;
    var map = new L.Map(id, {
      center: [41.652044, -4.728007],
      zoom: 18
    });

    var baseLayer = L.tileLayer('http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',{
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
    }).addTo(map);

    cartodb.createLayer(map, {
        user_name: credentials.user_name,
        type: 'cartodb',
        sublayers: []
    })
    .addTo(map) 
    .done(function(layer) {
      callback(map);
    });
  }

  function enableDrawing(map) {
    var drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    var drawControl = new L.Control.Draw({
        edit: {
            featureGroup: drawnItems
        },
        draw: {
          polygon: true,
          rectangle: false,
          circle: false,
          marker: false,
          polyline: false
        }
    });
    map.addControl(drawControl);
  }

  function onDrawCreated(e) {
    var type = e.layerType,
        layer = e.layer;

    var geoJSON = JSON.stringify(layer.toGeoJSON().geometry);
    editor.clearLayers();
    service.newArea(editor.protest, editor.density, geoJSON, function(response) {
      editor.loadProtestLayer(editor.protest);
    }, errorCallback);

  }

  var title = appendChild('h1', protestEditor, 'title');

  loadDensities(protestEditor, function(densities) {
    editor.densities = densities;
  }, function(chosenDensity) {
    editor.density = chosenDensity;
  });

  var backButton = appendChildDiv(protestEditor, 'back', 'back');
  backButton.innerText = 'X';
  backButton.onclick = callback;

  return editor
}

function loadDensities(container, callback, selectionCallback) {
  var densitiesSelector = appendChildDiv(container, 'density-selector', 'density-selector');
  requestDensities(function(response) {
    var densities = response.densities;

    var densityOptions = densities.map(function(density) {
      var densityOption = appendChildDiv(densitiesSelector, 'density-' + density.density, 'density-item');
      densityOption.innerHTML = density.density + "<span class='unit'> p/m<sup>2</sup></span>";
      densityOption.title = LABELS.DENSITY_OPTION_TITLE;
      densityOption.onclick = function() {
        densityOptions.forEach(deselect);
        select(this);
        selectionCallback(density.density);
      };
      return densityOption;
    });

    densityOptions[0].click();
    callback(densities);
  });
}

function select(element) {
  element.className += ' selected';
}

function deselect(element) {
  element.className = element.className.split(' ').filter(function(aClassName) {
    return aClassName != 'selected';
  }).join(' ');
}

function requestDensities(callback) {
  callback({
    densities: [
      {
        density: 1,
        color: '#FF9999'
      },
      {
        density: 2,
        color: '#AA6666'
      },
      {
        density: 3,
        color: '#993333'
      },
      {
        density: 4,
        color: '#660000'
      },
    ]
  });
}
