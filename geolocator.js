/*jslint browser:true, nomen:true, regexp:true, unparam:true */
/*global google:false */


/** @license  Geolocator Javascript Lib v.1.2.9
 *  (c) 2014-2015 Onur Yildirim (onur@cutepilot.com)
 *  https://github.com/onury/geolocator
 *  MIT License
 */

;(function() {
  /** Used to determine if values are of the language type `Object`. */
  var objectTypes = {
    'function': true,
    'object': true
  };

  /** Detect free variable `exports`. */
  var freeExports = (objectTypes[typeof exports] && exports && !exports.nodeType) ? exports : undefined;

  /** Detect free variable `module`. */
  var freeModule = (objectTypes[typeof module] && module && !module.nodeType) ? module : undefined;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = (freeModule && freeModule.exports === freeExports) ? freeExports : undefined;

  /** Detect free variable `global` from Node.js. */
  var freeGlobal = checkGlobal(freeExports && freeModule && typeof global == 'object' && global);

  /** Detect free variable `self`. */
  var freeSelf = checkGlobal(objectTypes[typeof self] && self);

  /** Detect free variable `window`. */
  var freeWindow = checkGlobal(objectTypes[typeof window] && window);

  /** Detect `this` as the global object. */
  var thisGlobal = checkGlobal(objectTypes[typeof this] && this);

  /**
   * Used as a reference to the global object.
   *
   * The `this` value is used if it's the global object to avoid Greasemonkey's
   * restricted `window` object, otherwise the `window` object is used.
   */
  var root = freeGlobal ||
    ((freeWindow !== (thisGlobal && thisGlobal.window)) && freeWindow) ||
    freeSelf || thisGlobal || Function('return this')();

  /**
   * Checks if `value` is a global object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {null|Object} Returns `value` if it's a global object, else `null`.
   */
  function checkGlobal(value) {
    return (value && value.Object === Object) ? value : null;
  }

  /*--------------------------------------------------------------------------*/

  function runInContext() {
    'use strict';

    // ---------------------------------------
    // PRIVATE PROPERTIES & FIELDS
    // ---------------------------------------

    var
    // Storage for the callback function to be executed when the location
    // is successfully fetched.
      onSuccess,
      // Storage for the callback function to be executed when the location
      // could not be fetched due to an error.
      onError,
      // Google Maps URL.
      googleLoaderURL = 'https://www.google.com/jsapi',
      // Google Maps version to be loaded
      mapsVersion = '3.23',
      // wikimedia provides location-by-IP information.
      ipGeoSource = '//bits.wikimedia.org/geoiplookup',
      // The index of the current IP source service.
      sourceIndex;

    // ---------------------------------------
    // PRIVATE METHODS
    // ---------------------------------------

    /** Non-blocking method for loading scripts dynamically.
     */
    function loadScript(url, callback, removeOnCallback) {
      var script = document.createElement('script');
      script.async = true;

      function execCb(cb, data) {
        if (removeOnCallback && script.parentNode) {
          script.parentNode.removeChild(script);
        }
        if (typeof cb === 'function') {
          cb(data);
        }
      }

      if (script.readyState) {
        script.onreadystatechange = function(e) {
          if (script.readyState === 'loaded' || script.readyState === 'complete') {
            script.onreadystatechange = null;
            execCb(callback);
          }
        };
      } else {
        script.onload = function(e) { execCb(callback); };
      }

      script.onerror = function(e) {
        var errMsg = 'Could not load source at ' + String(url).replace(/\?.*$/, '');
        execCb(onError, new Error(errMsg));
      };

      script.src = url;
      document.getElementsByTagName('head')[0].appendChild(script);
    }

    /** Loads Google Maps API and executes the callback function when done.
     */
    function loadGoogleMaps(callback) {
      function loadMaps() {
        if (geolocator.__glcb) { delete geolocator.__glcb; }
        google.load('maps', mapsVersion, { other_params: '', callback: callback });
      }
      if (window.google !== undefined && google.maps !== undefined) {
        if (callback) { callback(); }
      } else {
        if (window.google !== undefined && google.loader !== undefined) {
          loadMaps();
        } else {
          geolocator.__glcb = loadMaps;
          loadScript(googleLoaderURL + '?callback=geolocator.__glcb');
        }
      }
    }

    /** Runs a reverse-geo lookup for the specified lat-lon coords.
     */
    function reverseGeoLookup(latlng, callback) {
      var geocoder = new google.maps.Geocoder();

      function onReverseGeo(results, status) {
        if (status === google.maps.GeocoderStatus.OK) {
          if (callback) { callback(results); }
        }
      }
      geocoder.geocode({ 'latLng': latlng }, onReverseGeo);
    }

    /** Fetches additional details (from the reverse-geo result) for the address property of the location object.
     */
    function fetchDetailsFromLookup(data) {
      if (data && data.length > 0) {
        var i, c, o = {},
          comps = data[0].address_components;
        for (i = 0; i < comps.length; i += 1) {
          c = comps[i];
          if (c.types && c.types.length > 0) {
            o[c.types[0]] = c.long_name;
            o[c.types[0] + '_s'] = c.short_name;
          }
        }

        geolocator.location.formattedAddress = data[0].formatted_address;
        geolocator.location.address = {
          street: o.route || '',
          neighborhood: o.neighborhood || '',
          town: o.sublocality || '',
          city: o.locality || '',
          region: o.administrative_area_level_1_s || '',
          country: o.country || '',
          countryCode: o.country_s || '',
          postalCode: o.postal_code || '',
          streetNumber: o.street_number || ''
        };
      }
    }

    /** Finalizes the location object via reverse-geocoding and draws the map (if required).
     */
    function finalize(coords) {
      var latlng = new google.maps.LatLng(coords.latitude, coords.longitude);

      function onGeoLookup(data) {
        fetchDetailsFromLookup(data);

        if (onSuccess) { onSuccess.call(null, geolocator.location); }
      }
      reverseGeoLookup(latlng, onGeoLookup);
    }

    /** Gets the geo-position via HTML5 geolocation (if supported).
     */
    function getPosition(fallbackToIP, html5Options) {
      geolocator.location = null;

      function fallback(error) {
        geolocator.locateByIP(onSuccess, onError);
      }

      function geoSuccess(position) {
        geolocator.location = {
          ipGeoSource: null,
          coords: position.coords,
          timestamp: (new Date()).getTime() //overwrite timestamp (Safari-Mac and iOS devices use different epoch; so better use this).
        };
        finalize(geolocator.location.coords);
      }

      function geoError(error) {
        fallback(error);
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(geoSuccess, geoError, html5Options);
      } else { // not supported
        fallback(new Error('geolocation is not supported.'));
      }
    }

    /** The callback that is executed when the location data is fetched from the source.
     */
    function onGeoSourceCallback(data) {
      var initialized = false;
      geolocator.location = null;
      delete geolocator.__ipscb;

      function gLoadCallback() {
        if (window.Geo !== undefined) {
          geolocator.location = JSON.parse(JSON.stringify(window.Geo));
          delete window.Geo;
          initialized = true;
        }

        if (initialized == true) {
          if (onSuccess) {
            onSuccess.call(null, geolocator.location);
          }
        } else if (onError) {
          onError(new Error(data || 'Could not get location.'));
        }
      }

      gLoadCallback();
    }

    return {

      // ---------------------------------------
      // PUBLIC PROPERTIES
      // ---------------------------------------

      /** The recent location information fetched as an object.
       */
      location: null,

      // ---------------------------------------
      // PUBLIC METHODS
      // ---------------------------------------

      /** Gets the geo-location by requesting user's permission.
       */
      locate: function(successCallback, errorCallback, fallbackToIP, html5Options) {
        onSuccess = successCallback;
        onError = errorCallback;

        function gLoadCallback() { getPosition(fallbackToIP, html5Options); }
        loadGoogleMaps(gLoadCallback);
      },

      /** Gets the geo-location from the user's IP.
       */
      locateByIP: function(successCallback, errorCallback) {
        onSuccess = successCallback;
        onError = errorCallback;
        geolocator.__ipscb = onGeoSourceCallback;
        loadScript(ipGeoSource, onGeoSourceCallback, true);
      },

      /** Checks whether the type of the given object is HTML5
       *  `PositionError` and returns a `Boolean` value.
       */
      isPositionError: function(error) {
        return Object.prototype.toString.call(error) === '[object PositionError]';
      }
    };
  }

  /*--------------------------------------------------------------------------*/

  // Export geolocator.
  var geolocator = runInContext();

  // Expose lodash on the free variable `window` or `self` when available. This
  // prevents errors in cases where lodash is loaded by a script tag in the presence
  // of an AMD loader. See http://requirejs.org/docs/errors.html#mismatch for more details.
  (freeWindow || freeSelf || {}).geolocator = geolocator;

  // Some AMD build optimizers like r.js check for condition patterns like the following:
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // Define as an anonymous module so, through path mapping, it can be
    // referenced as the "underscore" module.
    define(function() {
      return geolocator;
    });
  }
  // Check for `exports` after `define` in case a build optimizer adds an `exports` object.
  else if (freeExports && freeModule) {
    // Export for Node.js.
    if (moduleExports) {
      (freeModule.exports = geolocator).geolocator = geolocator;
    }
    // Export for CommonJS support.
    freeExports.geolocator = geolocator;
  }
  else {
    // Export to the global object.
    root.geolocator = geolocator;
  }
}.call(this));
