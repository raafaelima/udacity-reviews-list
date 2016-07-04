moment.locale('pt-BR');

/**
 * A single object that will be globla exposed and house various sub objects
 */
var myGlobal = {
  //hold current stats
  stats: {},
  //hold some unfiltered stats
  staticStats: {},
  //saved dates for restoring
  savedDates: {from:null, to:null},
  //timers
  timerTimeout: null,
  resizeTimeout: null,
  searchTimeout: null,
  //hold ajax spinner
  spinner: new Spinner(),
  //prevent rapid events in case an event loop sneaks in
  eventThrottle: 50,
  //prevent window resize form firing anything until it stops
  sizeThrottle: 100,
  //prevent search from firing until typing slows a little
  searchThrottle: 150,
  //prevent trying to load new data while a data load is active
  loadingNow: false,
  //flag to prevent date picker events from firing date picker updates
  datePickerActive: false,
  //toggle picker event so dates can be edited without firing events
  datePickerEnabled: false,
  //prevent search and filter events from stepping on eachother
  listUpdateActive: false,
  //how many days back should a refresh (not initial load) try to grab
  refreshDays: 30,
  //only load refresh amount even if data is empty
  recentOnly: false,  
  //should a cors proxy be used?
  useProxy: false,
  //prevent filter events while search is already running
  debug: false
};

var curDataStr;

/**
 * options for listjs including an ugly html template to use
 * for the list itself when parsing in items from Udacity data
 */
var options = {
  valueNames: [ 'id',
                { name: 'full_feedback', attr: 'data-content'},
                { name: 'duration', attr: 'data-content'},
                'completedDate', 'earned', 'stars', 'name', ],
  page: 5,
  plugins: [ ListPagination({outerWindow: 1}),
             ListFuzzySearch() ],
  item: '<li class="list-group-item"><div class="row">' +
        '<div class="cell col-sm-2 col-xs-2">' +
        '<a href="javascript:;" class="link pulsed"><span class="id"></span></a>' +
        '</div><div class="cell col-sm-2 col-xs-2">' +
        '<span class="completedDate duration" data-placement="auto top" ' +
        'data-toggle="popover"' +
        'data-trigger="hover"></span>' +
        '</div><div class="cell col-sm-2 col-xs-2">' +
        '<span class="earned"></span>' +
        '</div><div class="cell col-sm-2 col-xs-2">' +
        '<span class="stars full_feedback" data-placement="auto top" ' +
        'data-toggle="popover"' +
        'data-trigger="hover"></span>' +
        '</div><div class="cell col-sm-4 col-xs-4">' +
        '<span class="name"></span>' +
        '</div></div>' +
        '</li>'
};


//Instantiate the listjs list
var userList = new List('reviews', options, '');

//initial fill of our stats object
resetStats();

/**
 * sets myGlobal.stats back to clean values
 */
function resetStats() {
  debug("reset stats triggered");
  myGlobal.stats = {
    throttled: true,
    reviewCount: 0,
    earned: 0,
    avgEarned: 0,
    startDate: moment('2999-01-01'),
    recentDate: moment('1980-01-01'),
    duration: moment.duration(0),
    avgDuration: 0,
    projects: []
  };
  debug("reset stats ended");
}

/**
 * parses a javascrip object and manipulates it some for use
 * in the searchable list
 * @param  {object} vals javascript object containing Udacity data from JSON
 * @return {object} parsed and somewhat modified javascript object
 */
var parseVals = function(vals) {
  debug("parse vals triggered");
  var ret = JSON.parse(JSON.stringify(vals));
  myGlobal.stats.reviewCount += ret.length; //total reviews
  ret.forEach(function(review){
    //linkify id
    review.link = "https://review.udacity.com/#!/reviews/" + review.id;
    //pull the project name to the top level
    review.name = review.project.name;
    review.earned = numToMoney(+review.price);

    //if completed_at is missing, use created_at instead
    //TODO: consider a gener date helper function with multiple fallbacks
    if (!moment(review.completed_at,moment.ISO_8601,true).isValid()) {
      review.completed_at = review.created_at;
    }
    review.completedDate = moment(review.completed_at).format("L");


    //date stuff
    var dateAssn = moment(review.assigned_at);
    var dateComp = moment(review.completed_at);
    var tempDur = moment.duration(dateComp.diff(dateAssn));

    review.duration = "Time to finish: " + pad(tempDur.hours()) + ":" +
                      pad(tempDur.minutes()) + ":" + pad(tempDur.seconds());
    review.rawDur = tempDur;

    var resultMap = {'passed': 'Meets Specifications',
                     'exceeded': 'Exceeds Specifications',
                     'failed': 'Requires Changes',
                     'ungradeable': "Unable to Review"};

    review.result = resultMap[review.result] || "Unknown";

      var starResult = '<span class="star-result"> (' + review.result[0] + ')</span>';

    if(review.rating) {
      //convert rating to stars.  If no rating, use result
      var stars = ['-o','-o','-o','-o','-o'];
      for (i = 0; i < +review.rating; i++) {
        stars[i] = '';
      }
      var starTemp = '<i class="fa fa-lgonlg fa-star{{type}}"></i>';
      review.stars = stars.map(function(star) {
        return starTemp.replace('{{type}}',star);
      }).join('') + starResult;
    }
    else {
      review.stars = starResult;
    }
    review.full_feedback = 'Result: ' + review.result + '. ' + (review.full_feedback || '');

    parseReviewStats(review);

  });

  //some format cleanup on stats to make them presentable
  cleanStats(); //needs to be first as it relies on unmutated numbers
  debug("parse vals ended (returned)");
  return ret;
};

/**
 * parses the searchable list's current visible JS object to recalculate stats
 */
var reCalcStats = function() {
  debug("recalc stats triggered");
  var curItems = userList.matchingItems;

  resetStats();
  myGlobal.stats.reviewCount = curItems.length;

  curItems.forEach(function(reviewParent){
    parseReviewStats(reviewParent.values());
  });

  //some format cleanup on stats to make them presentable
  cleanStats(); //needs to be first as it relies on unmutated numbers
  debug("recalc stats ended");
};

/**
 * Parses stats out of a single review and adjusts the stats object
 * @param  {object} review A single review object
 */
function parseReviewStats(review) {
  myGlobal.stats.duration.add(review.rawDur);
  var dateComp = moment(review.completed_at);
  if (myGlobal.stats.startDate.isAfter(dateComp, 'day')) myGlobal.stats.startDate = dateComp;
  if (myGlobal.stats.recentDate.isBefore(dateComp, 'day')) myGlobal.stats.recentDate = dateComp;

  if (!nameInArr(review.name, myGlobal.stats.projects)) {
    myGlobal.stats.projects.push({name: review.name, earned: 0,
                         count: 0, duration: moment.duration(0)});
  }
  //money stuff
  var proj = findNameInArr(review.name, myGlobal.stats.projects);
  proj[0].duration.add(review.rawDur);
  proj[0].earned += +review.price;
  proj[0].count += 1;
  myGlobal.stats.earned += +review.price;
}

/**
 * do some formatting on the stats.project subobject so
 * it is easier to display in the DOM
 */
function cleanStats() {
  debug("Clean stats triggered");
  //projects
  myGlobal.stats.projects.forEach(function(project) {
    project.earnedPerc = '' + Math.round(project.earned / myGlobal.stats.earned * 1000) / 10 + '%';
    project.countPerc = '' + Math.round(project.count / myGlobal.stats.reviewCount * 1000) / 10 + '%';
    project.durationPerc = '' + Math.round(project.duration / myGlobal.stats.duration * 1000) / 10 + '%';
    project.earned = numToMoney(project.earned);
    var pDur = moment.duration((project.duration/project.count));
    project.avgDuration = pad(pDur.hours()) + ":" + pad(pDur.minutes()) + ":" + pad(pDur.seconds());
    project.count = numWithComs(project.count);
  });
  //other

  //order here is important as numbers are overwritten with text after being used
  myGlobal.stats.avgEarned = numToMoney(myGlobal.stats.earned / myGlobal.stats.reviewCount);
  myGlobal.stats.earned = numToMoney(myGlobal.stats.earned);
  myGlobal.stats.startDate = myGlobal.stats.startDate.format("l");
  myGlobal.stats.recentDate = myGlobal.stats.recentDate.format("l");
  var dur = moment.duration((myGlobal.stats.duration/myGlobal.stats.reviewCount));
  myGlobal.stats.avgDuration = pad(dur.hours()) + ":" + pad(dur.minutes()) + ":" + pad(dur.seconds());
  myGlobal.stats.reviewCount = numWithComs(myGlobal.stats.reviewCount);
  debug("Clean stats ended");
}

/**
 * Handle items that should be run whne the list updates
 */
function listUpdate(triggeredBy) {
  debug("list update triggered by " + triggeredBy +
        ". throttle state: " + myGlobal.stats.throttled);
  if(!myGlobal.stats.throttled) {
    reCalcStats();
    updateStats();
    handleHover();
    setTimeout(function(){myGlobal.stats.throttled = false;}, myGlobal.eventThrottle);
  }
  debug("list update ended");
}

/**
 * update the various navbar dom elements with stat information
 */
function updateStats() {
  debug("update stats triggered");
  var spnSt = '<span class="header-text">';
  var spanSt2 = '<span class="header-text notes" data-placement="auto bottom" ' +
        'data-toggle="popover" data-trigger="hover" data-content="';
  $('.statCnt').html('Reviews: ' + spnSt + myGlobal.stats.reviewCount + '</span>');
  $('.statEarned').html('Total Ganho: ' + spnSt + myGlobal.stats.earned + '</span>');
  $('.statAvg').html('Média de Ganhos: ' + spnSt + myGlobal.stats.avgEarned + '</span>');
  $('.statStart').html('Primeiro CR: ' + spanSt2 + "Overall Earliest: " +
                       myGlobal.staticStats.startDate + '">' + myGlobal.stats.startDate + '</span>');
  $('.statRecent').html('Último CR: ' + spanSt2 + "Overall Latest: " +
                        myGlobal.staticStats.recentDate + '">' + myGlobal.stats.recentDate + '</span>');
  $('.statAvgTime').html('<span class="hidden-sm">Média de Tempo </span>Gasto: ' + spnSt + myGlobal.stats.avgDuration + '</span>');

  var projStr = '';
  var projStr2 = '';
  var projStr3 = '';
  var projPre = '<li><a href="javascript:;">';
  var projSuf = '</a></li>';
  myGlobal.stats.projects.forEach(function(project) {
    //earned stuff
    projStr += projPre + project.name + ': ' + project.earned + ' (' +
    project.earnedPerc + ')' + projSuf;
    //count stuff
    projStr2 += projPre + project.name + ': ' + project.count + ' (' +
    project.countPerc + ')' + projSuf;
    //duration stuff
    projStr3 += projPre + project.name + ': ' + project.avgDuration + ' (' +
    project.durationPerc + ')' + projSuf;
  });
  $('.earnedDD').html(projStr);
  $('.countDD').html(projStr2);
  $('.avgTimeDD').html(projStr3);

  //also apply dates to the date picker
  //unless this event came from a date picker event
  if (!myGlobal.datePickerActive) updateDatePicker();
  debug("Update Stats ended");
}

/**
 * Get JSON from a token
 * @param  {string} token user auth token from Udacity
 */
function handleToken(token, isRefresh) {
  debug("Handle Token triggered");
  startSpin(200);

  $.ajaxPrefilter(function(options) {
      if (myGlobal.useProxy && options.crossDomain && jQuery.support.cors) {
          options.url = 'https://corsproxy-simplydallas.rhcloud.com/' + options.url;
      }
  });

  var ajaxOptions1 = getPullDate(true);
  var ajaxOptions2 = getPullDate();

  $.when($.ajax({method: 'GET',
      url: 'https://review-api.udacity.com/api/v1/me/submissions/completed.json',
      data: ajaxOptions1,
      headers: { Authorization: token }
    }),
    $.ajax({method: 'GET',
      url: 'https://review-api.udacity.com/api/v1/me/student_feedbacks.json',
      data: ajaxOptions2,
      headers: { Authorization: token }
    }))
  .done(function(data1, data2){
    //assuming both data pulls worked, merge feedback into
    //the review data so we can work with a single object / JSON
    if(data1[1] === "success" && data2[1] === "success") {
      debug(data1[0]);
      //shared key lookup object to help merging data
      var lookup = {};
      //make sure we use all reviews when merging in feedback
      if(isJson(JSON.stringify(data1[0]))) {
        data1 = mergeData(curData(), data1[0])
      }

      for (var i = 0, len = data1.length; i < len; i++) {
        lookup[data1[i].id] = data1[i];
      }
      for (i = 0, len = data2[0].length; i < len; i++) {
        var feedback = data2[0][i];
        var review = lookup[feedback.submission_id];
        //only try to edit this review if it was actually found
        //(which it normally should be)
        if(review !== undefined) {
          review.rating = feedback.rating;
          review.feedback = feedback.body;
          var full_feedback = 'Rating: ' + review.rating + '/5';
          if (review.feedback !== null) {
            full_feedback += '.  Feedback: ' + review.feedback;
          }
          review.full_feedback = full_feedback;
        }
        else {
          console.log("A review with id of " + feedback.submission_id +
            " was not found even though you have feedback for it!");
        }
      }
    }

    debug(data1);
    debug(data2);


    //clear out any existing searches for the new data
    $('.my-fuzzy-search').val('');
    $('.my-search').val('');

    var resJSON = JSON.stringify(data1);
    if(isJson(resJSON)) {
      saveData(resJSON);
      //time stamp this date so we know the last data pull date
      saveRefreshDate(moment().format())

      if(userList.size()) {
        userList.clear();
        resetStats();
      }
      userList.filter();
      handleData(resJSON);
      debug('filters cleared');
      stopSpin();
    }
    else {
      $('#alert1').removeClass('hide');
    }
  })
  .fail(function(error){
    stopSpin();
    $('#alert3').removeClass('hide');
  });
  debug("Handle Token ended");
}

/**
 * initialization function that kicks off various tasks
 * once varified data has been fed in from user input or local storage
 * @param  {string} dataStr [the JSON data in string format]
 */
function handleData(dataStr) {
  debug("Handle Data triggered");
  userList.add(parseVals(JSON.parse(dataStr)));
  userList.sort('id', { order: "desc" });
  $('.jumbotron').addClass('hide');
  $('.reviewsRow, .dropdown, .exportJSON, .exportCSV').removeClass('hide');
  $('.navbar-brand').addClass('visible-xs');
  $('.search').focus();
  myGlobal.staticStats = JSON.parse(JSON.stringify(myGlobal.stats));
  //fit the list to our current page state
  userList.page = getPageSize();
  userList.update();

  //make sure we don't try to restore empty dates by setting
  //our inital savedDates to the current max date range
  if (myGlobal.savedDates.from === null) {
    myGlobal.savedDates.from = myGlobal.staticStats.startDate;
  }
  if (myGlobal.savedDates.to === null) {
    myGlobal.savedDates.to = myGlobal.staticStats.recentDate;
  }


  updateStats();
  handleHover();

  //remove the throttle on filter updates to the navbar
  setTimeout(function(){myGlobal.stats.throttled = false;}, myGlobal.eventThrottle);
  debug("Handle Data ended");
}

/**
 * tooltip/popover are only initialized for currently visible
 * dom elements.  So every time we update what is visible this
 * is run again to ensure new elements have their popover
 */
function handleHover() {
  debug("Handle Hover triggered");
  $('.popover').remove(); //be sure no popovers are stuck open
  $('.full_feedback:not([data-content="null"],[data-content=""])')
  .popover({container: 'body'}).addClass('help-cursor');
  $('.duration').popover({container: 'body'}).addClass('hoverable');
  debug("Handle Hover ended");
}

/**
 * Fills the modal with review details and then shows it
 * @param  {int} The review id to show in the modal
 */
function handleModal(id) {
  debug("Handle Modal triggered");
  var data = userList.get('id', id)[0].values();
  var list = $('.modal-list');
  var pre = '<li class="list-group-item">';
  var content = pre + 'Review ID: ' + '<a target="_blank" href="' +
                data.link + '">' + data.id + '</a></li>' +
    pre + 'Project Title: ' + data.project.name +
          ' (ID: ' + data.project_id + ')</li>' +
    pre + 'Project Status: ' + data.status +
          ' (Earned: ' + data.earned + ')</li>' +
    pre + 'Grader: ' + data.grader.name +
          ' (ID: ' + data.grader_id + ')</li>' +
    pre + 'User: ' + data.user.name +
          ' (ID: ' + data.user_id + ')</li>' +

    pre + 'Created: ' + moment(data.created_at).format('llll') + '</li>' +
    pre + 'Assigned: ' + moment(data.assigned_at).format('llll') + '</li>' +
    pre + 'Completed: ' + moment(data.completed_at).format('llll') + '</li>' +
    pre + 'Updated: ' + moment(data.updated_at).format('llll') + '</li>' +
    pre + data.duration + '</li>';
    if (data.repo_url) {
      content += pre + '<a target="_blank" href="' + data.repo_url + '">Student Repo</a></li>';
    }
    if (data.archive_url) {
      content += pre + '<a target="_blank" href="' + data.archive_url + '">Student Zip Archive</a></li>';
    }
    // Removed until I can figure out if this is a valid url still
    // and if so, what the prefix is.
    // if (data.zipfile.url) {
    //   content += pre + '<a target="_blank" href="' + data.zipfile.url + '">Zip File</a></li>';
    // }
    if (data.rating) {
      content += pre + 'Student Feedback Rating: ' + data.rating + '</li>';
    }
    if (data.feedback) {
      content += pre + 'Student Feedback Note: ' + data.feedback + '</li>';
    }
    if (data.notes) {
      content += pre + 'Student General Note: ' + marked(data.notes) + '</li>';
    }
    if (data.general_comment) {
      content += pre + 'Grader General Comment: ' + marked(data.general_comment) + '</li>';
    }
    //start section that is likely to be null
    if (data.status_reason) {
      content += pre + 'Status Reason: ' + marked(data.status_reason) + '</li>';
    }
    if (data.result_reason) {
      content += pre + 'Result Reason: ' + marked(data.result_reason) + '</li>';
    }
    if (data.training_id) {
      content += pre + 'Training ID: ' + data.training_id + '</li>';
    }
    if (data.url) {
      content += pre + 'URL: ' + data.url + '</li>';
    }
    if (data.annotation_urls.length > 0) {
      content += pre + 'Annotation URLs: ' + annotation_urls + '</li>';
    }
    if (data.previous_submission_id) {
      content += pre + 'URL: ' + data.previous_submission_id + '</li>';
    }
    if (data.nomination) {
      content += pre + 'URL: ' + data.nomination + '</li>';
    }
    //end likely to be null section
    content += pre + 'Udacity Key: ' + data.udacity_key + '</li>';

  list.html(content);
  $('.modal').modal();
  debug("Handle Modal ended");
}


/**
 * initialize the datepicker for date filtering and add an event listener
 */
function initDatePicker() {
  debug("init date picker triggered");
  $('.input-daterange').datepicker({
      //this will get local date format pattern from moment
      todayBtn: "linked",
      format: moment.localeData().longDateFormat('l').toLowerCase(),
      todayHighlight: true,
      autoclose: true
  }).on('changeDate', function(e) {
      if(myGlobal.datePickerEnabled) filterListDates();
  });
  debug("init date picker ended");
}

/**
 * ensure datePicker has the correct dates in it after a list change
 */
function updateDatePicker() {
  debug("update date picker triggered");
  //prevent unwanted events while we set dates
  myGlobal.datePickerEnabled = false;

  var fromDate = myGlobal.staticStats.startDate
  var toDate =myGlobal.staticStats.recentDate

  //restore saved dates if the user chooses that setting
  var datesState = curDatesState();
  if (datesState === "from" || datesState === "both") {
    fromDate = myGlobal.savedDates.from;
  }
  if (datesState === "both") {
    toDate = myGlobal.savedDates.to;
  }


  var updated = false;
  var startNow = moment($('.fromDate').datepicker('getDate')).format("l");
  if (startNow !== myGlobal.stats.startDate) {
    $('.fromDate').datepicker('setDate', fromDate);
    updated = true;
  }
  var endNow = moment($('.toDate').datepicker('getDate')).format("l");
  if (endNow !== myGlobal.stats.recentDate) {
    $('.toDate').datepicker('setDate', toDate);
    updated = true;
  }
  //Now that things are set up, allow date picker events again
  myGlobal.datePickerEnabled = true;
  debug("update date picker ended");
}

/**
 * Filters the review history list based on dates in the datepicker
 */
function filterListDates(){
  debug("date filter triggered");
  myGlobal.datePickerActive = true;
  var f = moment($('.fromDate').datepicker('getDate')).subtract(1, 'day');
  var t = moment($('.toDate').datepicker('getDate')).add(1, 'd');
  userList.filter(function(item) {
    return moment(item.values().completed_at).isBetween(f, t, 'day');
  });
  myGlobal.datePickerActive = false;
  debug("date filter ended");
}

/**
 * Copies the helper code to user's clipboard silently
 * No flash fallback or anything.  It is assumed reviewers
 * are using a decent modern browser
 */
function copyCodeToClipboard() {

  //this works by adding a hidden element, copying from that
  //and then removing the element when done.  Clunky but silent.
    var aux = document.createElement("textarea");

    aux.cols = "400";
    aux.rows = "100";

    aux.value = "copy($.ajax({" +
      "method: 'GET'," +
      "url: 'https://review-api.udacity.com/api/v1/me/submissions/completed.json'," +
      "headers: { Authorization: JSON.parse(localStorage.currentUser).token }," +
      "async: false" +
      "}).done(function(data){console.log('The data should now be in your clipboard " +
      "and ready to paste into the tool');}).responseJSON)";

    document.body.appendChild(aux);
    aux.select();
    document.execCommand("copy");
    document.body.removeChild(aux);
}

/**
 * Either pulls data from existing token or if one is not found
 * resets data to the current stored data in localStorage
 */
function refreshData() {
    debug('Handling Data as no token found on refresh');
    var oldData = curDataStr;
    if (oldData !== '{}') {
      userList.clear();
      resetStats();
      handleData(oldData);
    }
    else {
      window.alert("No valid token or data found in localStorage!");
    }
}

/**
 * Begins an AJAX loading spinner after a set delay
 * The delay is to avoid flashing it for very fast responses
 * Also prevents further clicking actions on input boxes/buttons
 * @param  {number} delay number of milliseconds to delay before spinning
 */
function startSpin(delay) {
  myGlobal.loadingNow = true;

  if (myGlobal.spinner === undefined) {
    myGlobal.spinner = new Spinner();
  }
  myGlobal.timerTimeout = setTimeout(function() {
    myGlobal.spinner.spin(document.getElementById('spin-target'));
    $('.fa-refresh').addClass('fa-spin');
  }, delay);
}

/**
 * Stops the AJAX loading spinner and removes any pending spin timeout
 * Also restores clicking actions on input boxes/buttons
 */
function stopSpin() {
  clearTimeout(myGlobal.timerTimeout);
  myGlobal.spinner.stop();
  myGlobal.loadingNow = false;
  $('.fa-refresh').removeClass('fa-spin');
}

/**
 * Enables and disables custom darker page theme
 */
function toggleTheme(firstLoad) {
  var themeState = curThemeState();
  if(!firstLoad) {
    themeState = (themeState === "on") ? "off" : "on";
    saveThemeState(themeState);
  }
  themeState === "on" ? themeOn() : themeOff();
}

/**
 * Enables and disables custom darker page theme
 */
function toggleDates(firstLoad) {
  var datesState = curDatesState();
  var dateIcon = $('.toggleDates').find('.fa');

  if(!firstLoad) {
    if (datesState === "none") {
      datesState = "both";
    }
    else if (datesState === "both") {
      datesState = "from"
    }
    else {
      datesState = "none"
    }
    saveDatesState(datesState);
  }

  //now set the actual icon
  if (datesState === "none") {
    dateIcon.removeClass('fa-calendar-minus-o fa-calendar-check-o')
            .addClass('fa-calendar-times-o');
  }
  else if (datesState === "both") {
    dateIcon.removeClass('fa-calendar-minus-o fa-calendar-times-o')
            .addClass('fa-calendar-check-o');
  }
  else if (datesState === "from") {
    dateIcon.removeClass('fa-calendar-times-o fa-calendar-check-o')
            .addClass('fa-calendar-minus-o');
  }
}

/**
 * disable custom darker page theme
 */
function themeOn() {
  $('body').addClass('color-body');
  var nav = $('.navbar-mine, .navbar-default');
  nav.addClass('navbar-mine').removeClass('navbar-default');
}

/**
 * disable custom darker page theme
 */
function themeOff() {
  $('body').removeClass('color-body');
  var nav = $('.navbar-mine, .navbar-default');
  nav.removeClass('navbar-mine').addClass('navbar-default');
}

/**
 * decides the number of items to show based on the current window
 * innerHeight
 * @return {number} the number of items to show
 */
function getPageSize() {
  //assume a height of 32, but if we already have renderred items
  //use their height since zoom throws it off
  var itemSize = $('.list-group-item:first').outerHeight(true);
  itemSize = Math.max(itemSize, 32);
  var filterSize = $('.filter-row').outerHeight(true);
  var buttonSize = $('.button-row').outerHeight(true);
  var pageSize = $('.pagination').outerHeight(true);
  var navSize = $('.navbar-header').outerHeight(true) || $('#navbar').outerHeight(true);
  var listMargins = 22;
  var wiggleRoom = 25;

  var baseSize = filterSize + buttonSize + pageSize +
                 navSize + listMargins + wiggleRoom;

  var rawNum = (window.innerHeight - baseSize) / itemSize;
  return Math.max(rawNum, 5)  //show 5 items or more always
}


/**
 * convert a number to monetary format with $ and commas
 * will also work with a number parsable string as input
 * @param  {number} num [number to convert to money string]
 * @return {string}   [string in format of $1,000.00]
 */
function numToMoney(num) {
    num = Math.round(num*100)/100;
    return '$' + numWithComs(num);
}

/**
 * add commas to numbers at 3 character intervals
 * also works with a number parsable string
 * @param  {number} num [number to convert to string]
 * @return {string}     [number with commas added]
 */
function numWithComs(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * look for a given name in an array.  return true if found
 * @param  {string} name string to look for
 * @param  {array} arr  array to look for a string in
 * @return {boolean}
 */
function nameInArr(name, arr)
{
    var test = findNameInArr(name, arr);
    return (test.length > 0);
}

/**
 * look for a given name in an array.  The format of the array
 * is taken for granted to include a name as a first level key
 * @param  {string} name string to look for
 * @param  {array} arr  array to look for a string in
 * @return {object} object containing the name or a 0 length object
 */
function findNameInArr(name, arr) {
  return $.grep(arr, function(e){ return e.name == name; });
}

/**
 * Takes existing review data and merges in newer data
 * Any old review is overwritten and any new review is appended
 * @param  {object} oldData existing review data
 * @param  {object} newData newer review data from refresh
 * @return {object} merged review data
 */
function mergeData(oldData, newData) {
  var oData = JSON.parse(JSON.stringify(oldData));
  if ($.type(oData) !== 'array') oData = [];
  var nData = JSON.parse(JSON.stringify(newData));

  //make a lookup helper to facilitate the merge
  var lookup = {};
  for (var i = 0, len = oData.length; i < len; i++) {
      lookup[oData[i].id] = oData[i];
  }
  //loop through new data and either replace or append to old data
  for (var i = 0, len = nData.length; i < len; i++) {
       var newReview = nData[i];
       var oldReview = lookup[newReview.id];
       if (oldReview !== undefined) {
        oldReview = newReview
       }
       else {
        oData.push(newReview);
       }
  }
  return oData;
}

/**
 * Check if an object is valid Udacity JSON in string format
 * @param  {string} item [object to test]
 * @return {Boolean}
 */
function isJson(item) {
    item = typeof item !== "string" ?
        JSON.stringify(item) :
        item;

    try {
        item = JSON.parse(item);
    } catch (e) {
        return false;
    }

    if ($.type(item) === "array" && item != null) {
      if (item[0].udacity_key !== undefined) {
        return true;
      }
    }
    else {
      debug("invalid JSON tested (probably empty)");
    }

    return false;
}

/* Start section for local storage helpers */

function resetAll() {
  var r = confirm("Are you sure you want to reset everything?  " +
    "The only thing that will be kept is your last used token.");
  if (r == true) {
    var tokenCache = curToken();
    resetStats();
    deleteData();
    deleteDatesState();
    deleteThemeState();
    deleteRefreshDate();
    debug("everything reset");
    location.reload(true);
  } else {
    debug("full reset cancelled")
  }  
}

function saveRefreshDate(date) {
  localStorage.setItem('lastRefreshDate', date);
}

function deleteRefreshDate() {
  localStorage.removeItem('lastRefreshDate')
}

function curRefreshDateStr() {
  return localStorage.getItem('lastRefreshDate')  || '{}';
}

function curRefreshDate() {
  if (curRefreshDateStr() !== '{}') {
    return moment(curRefreshDateStr());
  }
  return 0;
}

function curToken() {
  return localStorage.getItem('lastToken') || '{}';
}

function deleteData() {
  localforage.removeItem('lastJSON');
  localStorage.removeItem('lastRefreshDate')
}

function saveData(data) {
  localforage.setItem('lastJSON', data);
}

 function curData() {
  return JSON.parse(curDataStr);
}

function deleteDatesState() {
  localStorage.removeItem('datesState');
}

function saveDatesState(data) {
  localStorage.setItem('datesState', data);
}

function curDatesState() {
  return localStorage.getItem('datesState') || 'from';
}

function deleteThemeState() {
  localStorage.removeItem('themeState');
}

function saveThemeState(data) {
  localStorage.setItem('themeState', data);
}

function curThemeState() {
  return localStorage.getItem('themeState') || 'on';
}

/* End section for local storage helpers */


/**
 * decides how many days to pull based on saved timestamp and settings
 * @return {date or number} the date to pull from, or 0 for epoch
 */
function getPullDate(nullFullRange) {
  var retObj = {start_date: 0};
  if (nullFullRange) retObj = {};
  if ($.type(curData()) !== 'array' && !myGlobal.recentOnly) {
    return retObj;
  }
  var oldDate = curRefreshDate();
  if (oldDate === 0 && !myGlobal.recentOnly) return retObj

  var dateAge = moment().diff(moment(curRefreshDate()),'d');
  var daysNeeded = Math.max(myGlobal.refreshDays, dateAge);
  if (myGlobal.recentOnly) {
    daysNeeded = myGlobal.refreshDays;
  }
  retObj.start_date = moment().subtract(daysNeeded, 'd').startOf('d').format();
  return retObj;
}

/**
 * Visually flashes icons.  Used for click feedback
 * @param  {object} el jQuery or DOM element object to pulse
 * @param  {number} delay time to keep effect in place (defaults to 200)
 */
function pulse(el, delay) {
  delay = delay || 200;
  if (!el.jquery) el = $(el);
  el.addClass('pulse');
  setTimeout(function(){
    el.removeClass('pulse');
    }, delay)
}

/**
 * Simple debug helper so console log debugs can be left in but
 * only trigger when a flag is on
 * @param  {multiple} message what should be logged to the console
 */
function debug(message) {
  if (myGlobal.debug) console.log(message);
}

/******** click and event handlers ********/

/**
 * click handler for the button that loads previously saved
 * user data from localStorage
 */
$('#lastData').click(function(){
  if (!myGlobal.loadingNow) {
    var oldData = curDataStr;
    if (isJson(oldData)) {
      handleData(oldData);
    }
    else {
      $('#alert2').removeClass('hide');
    }
  }
});

/**
 * click handler for the earliest date in navbar
 */
$('.statStart').click(function() {
  this.blur();
  pulse($('.fromDate'));
  $('.fromDate').datepicker('setDate', myGlobal.staticStats.startDate);
});

/**
 * click handler for the recent date in navbar
 */
$('.statRecent').click(function() {
  this.blur();
  pulse($('.toDate'));
  $('.toDate').datepicker('setDate', myGlobal.staticStats.recentDate);
});

/**
 * click handler for the helper code button in navbar
 */
$('.copyCode').click(function() {
  copyCodeToClipboard();
});

/**
 * click handler for the data refresh in navbar
 */
$('.refreshData').click(function() {
  refreshData();
});

/**
 * click handler for .json export in navbar
 */
$('.exportJSON').click(function() {
  exportJSON();
});

/**
 * click handler for CSV export in navbar
 */
$('.exportCSV').click(function() {
  exportCSV();
});

/**
 * click handler for theme toggle in navbar
 */
$('.toggleTheme').click(function() {
  toggleTheme();
});

/**
 * click handler for theme toggle in navbar
 */
$('.toggleDates').click(function() {
  toggleDates();
});

/**
 * click handler for id links to open modal for that id
 * set to inherit event from main list since these are
 * dynamic appends
 */
$('#main-list').on('click', '.id', function() {
  handleModal(this.innerHTML);
});


/**
 * click handler for objects that get a pulse visual effect
 */
$('body').on('click', '.pulsed', function() {
  this.blur();
  pulse(this);
  pulse($(this).find('.fa'));
});

/**
 * Custom search keypress handler to allow restricting search
 * to specific fields only and throttle input
 */
$('.my-search').on('propertychange input', function() {
  if(!myGlobal.loadingNow) {
    $('.my-fuzzy-search').val('');
    clearTimeout(myGlobal.searchTimeout);
    //use 200ms timer to check when active typing has ended
    myGlobal.searchTimeout = setTimeout(function(){
      var filterArr = ['id', 'completedDate', 'earned', 'result', 'name'];
      userList.search($('.my-search').val(), filterArr);
    }, myGlobal.searchThrottle);
  }
});

/**
 * Custom search keypress handler to allow restricting fuzzy-search
 * to specific fields only and throttle input
 */
$('.my-fuzzy-search').on('propertychange input', function() {

  if(!myGlobal.loadingNow) {
    $('.my-search').val('');
    clearTimeout(myGlobal.searchTimeout);
    //use 200ms timer to check when active typing has ended
    myGlobal.searchTimeout = setTimeout(function(){
      var filterArr = ['id', 'completedDate', 'earned', 'result', 'name'];
      userList.fuzzySearch.search($('.my-fuzzy-search').val(), filterArr);
    }, myGlobal.searchThrottle);
  }
});

/**
 * Keypress event to capture enter key in the textarea
 * that is used to input api auth token as text from Udacity
 */
$('#tokenInput').keypress(function(event) {
    // Check the keyCode and if the user pressed Enter (code = 13)
    if (event.keyCode == 13 && !myGlobal.loadingNow) {
      handleToken(this.value);
      this.value = '';
    }
});

/**
 * initialize popover for navbar buttons here so they are only done once
 */
$('.help').popover({container: 'body'});
$('.refreshData').popover({container: 'body'});


/**
 * pad a number to ensure it is 2 digits.
 * Important: Assumes 1 or 2 digit string format number.
 * @param  {string} str input string
 * @return {string}     padded output string
 */
function pad(str) {
  return ("0" + str).slice(-2);
}

/**
 * window resize event so that we can adjust list item number per
 * page to fit any size window within reason
 */
window.onresize = function(){
  clearTimeout(myGlobal.resizeTimeout);
  //prevent scrollbar on resize and restore after resize ends
  $('html, body').css('overflow-y', 'hidden');
  //use timer to check when active resizing has ended
  myGlobal.resizeTimeout = setTimeout(function(){
    $('html, body').css('overflow-y', 'visible');
    var oldPageSize = userList.page;
    var newPageSize = getPageSize();
    userList.page = newPageSize;
    userList.update();
    userList.show(1, userList.page);
    if (newPageSize > oldPageSize) handleHover();
  }, myGlobal.sizeThrottle);
};

/**
 * userList events that fire on list changes
 * Uses a shared throttle to avoid rapid duplicate events
 */
userList.on('searchComplete', function() {
  if (!myGlobal.listUpdateActive && !myGlobal.loadingNow) {
    myGlobal.listUpdateActive = true;
    listUpdate('search');
    myGlobal.listUpdateActive = false;
  }
});
userList.on('filterComplete', function() {
  if (!myGlobal.listUpdateActive && !myGlobal.loadingNow) {
    myGlobal.listUpdateActive = true;
    listUpdate('filter');
    myGlobal.listUpdateActive = false;
  }
});
//below events are not throttled
userList.on('sortComplete', handleHover);
userList.on('pageChangeComplete', handleHover);



/**
 * runs when the page loads and checks if there is user data
 * in localStorage.  If so, unhide a button element
 */
$(function() {
  toggleTheme(true); //set theme off if it was off on last load
  toggleDates(true); //set theme off if it was off on last load  
  initDatePicker();
  //clean up the old data item for users now that we use indexDB via
  //localforage
  //TODO: delete this once it has been a reasonable amount of time
  //since some people may actually need the localStorage fallback anyway
  localStorage.removeItem('lastJSON');

  //remove the big white div covering everything now that we
  //are done doing things that will be flashy and ugly on load
  //$('#cover').hide(400, 'opacity');
  localforage.getItem('lastJSON', function(err, data) {
    curDataStr = data || '{}';

    if (curDataStr !== '{}') {
      $('#lastData').removeClass('hide');
    }

    $('#cover').fadeOut(500);  
  });
  
});