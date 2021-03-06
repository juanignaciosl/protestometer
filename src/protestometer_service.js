SCHEMA_VERSION = 1;

function safe_callback(callback, arg) {
  if(typeof callback != 'undefined') {
    callback(arg);
  }
}

function protestometerService(credentials) {
  var sql = new cartodb.SQL({ user: credentials.user_name });

  var table_prefix = typeof credentials.table_prefix === 'undefined' ? 'pom' : credentials.table_prefix;

  var base_table = table_prefix + '_protestometer'
  var protests_table = table_prefix + '_protests';
  var areas_table = table_prefix + '_areas';

  var CHECK_BACKEND_SQL = "select count(1) from pg_class where relname = '" + base_table + "'";
  var PROTESTS_TABLE_COLUMNS = "id, name, created_at"; 
  var LOAD_PROTEST_SQL = "select " + PROTESTS_TABLE_COLUMNS + ", "
    + " (SELECT round(cast(sum(ST_Area(the_geom::geography)) as numeric), 2) from " + areas_table + " where protest_id = p.id ) as total_area, "
    + " (SELECT round(cast(sum(ST_Area(the_geom::geography) * density) as numeric), 2) from " + areas_table + " where protest_id = p.id ) as people_count "
    + " from " + protests_table + " p ";
  var LOAD_PROTESTS_SQL = LOAD_PROTEST_SQL + " order by created_at desc";
  var COUNT_AREAS_SQL = "select count(1) from " + areas_table;

  function loadProtestSql(protest) {
    return LOAD_PROTEST_SQL + " where p.id = " + protest.id;
  }

  function insertProtestSql(name) {
    return "insert into " + protests_table + " (name) values ('" + name + "') returning " + PROTESTS_TABLE_COLUMNS;
  }

  function insertAreaSql(protest, density, geoJSON) {
    return "insert into " + areas_table + " (protest_id, density, the_geom) "
      + " values ('" + protest.id + "', '" + density + "', " 
      + " ST_SetSRID(ST_GeomFromGeoJSON(NULLIF('" + geoJSON + "','')), 4326)"
      + ")";
  }

  function cartodbfytableSql(table) {
    return "select cdb_cartodbfytable(" 
      + (typeof credentials.organization_name === 'undefined' ? "" : "'" + credentials.user_name + "', ") 
      + "'" + table + "')";
  }

  var api = sqlApi(credentials);

  function setupBackend(credentials, callback, errorCallback) {
    var creationSqls = [
      "create table " + base_table + " (created_at timestamp not null default current_timestamp, schema_version integer default 1)",
      "create table " + protests_table + " (id serial primary key, name text not null, created_at timestamp not null default current_timestamp, updated_at timestamp not null default current_timestamp)",
      "create table " + areas_table + " (id serial primary key, protest_id integer not null, density numeric(4,2) not null, created_at timestamp not null default current_timestamp, updated_at timestamp not null default current_timestamp)",
      "alter table " + areas_table + " add constraint " + base_table + "_fk foreign key (protest_id) references " + protests_table + " (id) match full ",
      cartodbfytableSql(base_table),
      cartodbfytableSql(protests_table),
      cartodbfytableSql(areas_table),
      "insert into " + base_table + " (schema_version) values (" + SCHEMA_VERSION + ")"
    ];

    function creationStep(i, callback, errorCallback) {
      api.query(creationSqls[i], function() {
        i++;
        if(i < creationSqls.length) {
          creationStep(i, callback, errorCallback);
        } else {
          safe_callback(callback);
        }
      }, errorCallback);
    }

    creationStep(0, callback, errorCallback);
  }

  function densitiesCartocss(densities) {
    return densities.map(function(density) {
      return "#" + areas_table + "[density=" + density.density + "] { polygon-fill: " + density.color + "}";
    }).join(' ');
  }

  function checkCredentials(credentials) {
    return typeof credentials != 'undefined' && typeof credentials.user_name != 'undefined' && typeof credentials.api_key != undefined && credentials.user_name.length > 0 && credentials.api_key.length > 0;
  }

  var service = {
    load: function(callback, errorCallback) {
      if(!checkCredentials(credentials)) {
        errorCallback('You must set user_name and api_key credentials');
        return;
      };

      function checkPublicQuery() {
        api.publicQuery(COUNT_AREAS_SQL, function() {
          safe_callback(callback, service);
        }, errorCallback);
      }

      api.query(CHECK_BACKEND_SQL, function(response) {
        var initialized = response.rows[0].count > 0;
        if(initialized) {
          checkPublicQuery(callback, errorCallback);
        } else {
          setupBackend(credentials, function() {
            checkPublicQuery(callback, errorCallback);
          }, errorCallback);
        }
      }, errorCallback);
    },
    loadProtests: function(callback, errorCallback) {
      api.query(LOAD_PROTESTS_SQL, function(response) {
        safe_callback(callback, response.rows);
      }, errorCallback);
    },
    newProtest: function(name, callback, errorCallback) {
      api.query(insertProtestSql(name), function(response) {
        safe_callback(callback, response.rows[0]);
      }, errorCallback);
    },
    newArea: function(protest, density, geoJSON, callback, errorCallback) {
      api.query(insertAreaSql(protest, density, geoJSON), function(response) {
        api.query(loadProtestSql(protest), function(response) {
          safe_callback(callback, response.rows[0]);
        }, errorCallback);
      }, errorCallback);
    },
    loadProtestLayer: function(protest, map, callback, errorCallback) {
      cartodb.createLayer(map, {
        user_name: credentials.user_name,
        type: 'cartodb',
        sublayers: [{
          sql: "SELECT * FROM " + areas_table + " where protest_id = " + protest.id,
          cartocss: densitiesCartocss(protest.densities)
        }]
      })
      .addTo(map)
      .on('done', function(layer) {
        safe_callback(callback, layer);
      })
      .on('error', errorCallback);
    },
    getBounds: function(protest, callback, errorCallback) {
      sql.getBounds("select the_geom from " + areas_table + " where protest_id = " + protest.id)
        .done(function(bounds) {
          callback(bounds);
        });
    }
  }

  return service;
}

