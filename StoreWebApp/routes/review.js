var express = require('express');
var router = express.Router();
var http = require('request-promise-json');
var Promise = require('promise');
var UrlPattern = require('url-pattern');
var oauth = require('../server/js/oauth.js');
var config = require('config');

var session;
var api_url = new UrlPattern('(:protocol)\\://(:host)(/:org)(/:cat)(:api)/(:operation)');
var _myApp = config.get('Application');
var _apiServer = config.get('API-Server');
var _apiServerOrg = ((_apiServer.org == "") || (typeof _apiServer.org == 'undefined')) ? undefined : _apiServer.org;
var _apiServerCatalog = ((_apiServer.catalog == "") || (typeof _apiServer.catalog == 'undefined')) ? undefined : _apiServer.catalog;
var _apis = config.get('APIs');

/* Handle the GET request for obtaining item information and render the page */
router.get('/:id', function (req, res) {
  session = req.session;

  setGetReviewOptions(req, res)
    .then(sendApiReq)
    .then(sendResponse)
    .catch(renderErrorPage)
    .done();

});

/* Handle the POST request for creating a new item review */
router.post('/submitReview', function (req, res) {
  session = req.session;

  setNewReviewOptions(req, res)
    .then(submitNewReview)
    .catch(renderErrorPage)
    .done();

});

function setGetReviewOptions(req, res) {
  var params = req.params;

  var reviews_url = api_url.stringify({
    protocol: _apiServer.protocol,
    host: _apiServer.host,
    org: _apiServerOrg,
    cat: _apiServerCatalog,
    api: _apis.inventory.base_path,
    operation: "reviews/list?itemId=" + params.id
  });

  var getItemReviews_options = {
    method: 'GET',
    url: reviews_url,
    strictSSL: false,
    headers: {}
  };

  if (_apis.inventory.require.indexOf("client_id") != -1) getItemReviews_options.headers["X-IBM-Client-Id"] = _myApp.client_id;
  if (_apis.inventory.require.indexOf("client_secret") != -1) getItemReviews_options.headers["X-IBM-Client-Secret"] = _myApp.client_secret;

  return new Promise(function (fulfill) {

    // Get OAuth Access Token, if needed
    if (_apis.inventory.require.indexOf("oauth") != -1) {

      // If already logged in, add token to request
      if (typeof session.oauth2token !== 'undefined') {
        getItem_options.headers.Authorization = 'Bearer ' + session.oauth2token;
        getItemReviews_options.headers.Authorization = 'Bearer ' + session.oauth2token;
        fulfill({
          options: getItemReviews_options,
          res: res
        });
      } else {
        // Otherwise redirect to login page
        res.redirect('/login');
      }

    }
    else fulfill({
      options: getItemReviews_options,
      res: res
    });
  });

}

function setNewReviewOptions(req, res) {
  var form_body = req.body;

  var reqBody = {
    date: new Date(),
    rating: form_body.rating
  };

  // Add optional portions to the request body
  if (form_body.name !== '') reqBody.reviewer_name = form_body.name;
  if (form_body.email !== '') reqBody.reviewer_email = form_body.email;
  if (form_body.comment !== '') reqBody.comment = form_body.comment;

  var reviews_url = api_url.stringify({
    protocol: _apiServer.protocol,
    host: _apiServer.host,
    org: _apiServerOrg,
    cat: _apiServerCatalog,
    api: _apis.inventory.base_path,
    operation: "reviews/list?itemId=" + params.id
  });

  var options = {
    method: 'POST',
    url: reviews_url,
    strictSSL: false,
    headers: {},
    body: reqBody,
    JSON: true
  };

  if (_apis.inventory.require.indexOf("client_id") != -1) options.headers["X-IBM-Client-Id"] = _myApp.client_id;
  if (_apis.inventory.require.indexOf("client_secret") != -1) options.headers["X-IBM-Client-Secret"] = _myApp.client_secret;

  return new Promise(function (fulfill) {
    // Get OAuth Access Token, if needed
    if (_apis.inventory.require.indexOf("oauth") != -1) {

      // If already logged in, add token to request
      if (typeof session.oauth2token !== 'undefined') {
        options.headers.Authorization = 'Bearer ' + session.oauth2token;
        fulfill({
          options: options,
          item_id: form_body.itemId,
          res: res
        });
      } else {
        // Otherwise redirect to login page
        res.redirect('/login');
      }

    }
    else fulfill({
      options: options,
      item_id: form_body.itemId,
      res: res
    });
  });

}

function sendApiReq(function_input) {
  var options = function_input.options;
  var res = function_input.res;

  console.log("MY OPTIONS:\n" + JSON.stringify(options));

  // Make API call for Catalog data
  return new Promise(function (fulfill, reject) {
    http.request(options)
      .then(function (result) {
        //console.log("Catalog call succeeded with result: " + JSON.stringify(result));
        fulfill({
          data: result,
          res: res
        });
      })
      .fail(function (reason) {
        console.log("Inventory call failed with reason: " + JSON.stringify(reason));
        reject({
          err: reason,
          res: res
        });
      });
  });
}

function sendResponse(function_input) {
  var data = function_input.data;
  var res = function_input.res;

  // Render the page with the results of the API call
  res.setHeader('Content-Type', 'application/json');
  res.send(data);
}

function sendItemReq(function_input) {
  var getItem_options = function_input.getItem_options;
  var getItemReviews_options = function_input.getItemReviews_options;
  var res = function_input.res;

  // Make API call for item and reviews data
  return new Promise(function (fulfill, reject) {
    http.request(getItem_options)
      .then(function (item) {
        http.request(getItemReviews_options)
          .then(function (reviews) {

            fulfill({
              data: {
                item: item,
                reviews: reviews
              },
              res: res
            });
          })
          .done();
      })
      .fail(function (reason) {
        reject({
          err: reason,
          res: res
        });
      })
      .done();
  });
}

function submitNewReview(function_input) {
  var options = function_input.options;
  var item_id = function_input.item_id;
  var res = function_input.res;

  http.request(options)
    .then(function (data) {
      console.log("DATA: " + JSON.stringify(data));
      res.redirect('/item/' + item_id);
    })
    .fail(function (err) {
      console.log("ERR: " + JSON.stringify(err));
      res.redirect('/item/' + item_id);
    });
}

function renderPage(function_input) {
  var item = function_input.data.item;
  var reviews = function_input.data.reviews;
  var res = function_input.res;

console.log("Review Data: " + JSON.stringify(reviews));

 var imageBaseUrl = api_url.stringify({
    protocol: _apiServer.protocol,
    host: _apiServer.host,
    org: _apiServerOrg,
    cat: _apiServerCatalog,
    api: "",
    operation: ""
  });

  // Render the page with the results of the API call
  res.render('item', {
    title: 'IBM Cloud Architecture',
    item: item,
    reviews: reviews,
    base_url: imageBaseUrl,
    reviews_count: reviews.length
  });
}

function renderErrorPage(function_input) {
  var err = function_input.err;
  var res = function_input.res;
  res.render('error', {reason: err});
}

module.exports = router;
