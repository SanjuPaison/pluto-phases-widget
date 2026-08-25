
/*!
 * Pluto Phases — Event Explainer Engine
 * Ports the natal-chart, transiting-aspect, Pluto Phase era, and Book of Luck
 * logic from the PlutoAspects Android app (Kotlin) to run client-side.
 * Data (ephemeris.json, pluto.json, interpretations.json) is fetched from the
 * same host this script is served from.
 *
 * Usage: include this script on a page containing a container element with
 * id="pluto-phases-widget" (see nicepage-block.html for the expected markup).
 */
(function () {
  "use strict";

  // ---------- locate this script's own base URL, so data fetches work regardless of page ----------
  function getBaseUrl() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || "";
      if (src.indexOf("pluto-engine.js") !== -1) {
        return src.substring(0, src.lastIndexOf("/") + 1);
      }
    }
    return "./";
  }
  var BASE_URL = getBaseUrl();

  // ============================================================
  // AstroMath
  // ============================================================
  var AstroMath = {
    norm360: function (deg) {
      var d = deg % 360.0;
      if (d < 0) d += 360.0;
      return d;
    },
    toRad: function (deg) { return (deg * Math.PI) / 180.0; },
    toDeg: function (rad) { return (rad * 180.0) / Math.PI; },
    julianDay: function (year, month, day) {
      var y = year, m = month;
      if (m <= 2) { y -= 1; m += 12; }
      var a = Math.floor(y / 100.0);
      var b = 2 - a + Math.floor(a / 4.0);
      return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
    },
    julianCenturiesJ2000: function (jd) { return (jd - 2451545.0) / 36525.0; },
    meanObliquity: function (t) {
      return 23.43929111 - (46.815 * t + 0.00059 * t * t - 0.001813 * t * t * t) / 3600.0;
    },
    gmstDegrees: function (jd) {
      var t = this.julianCenturiesJ2000(jd);
      var gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
        0.000387933 * t * t - (t * t * t) / 38710000.0;
      return this.norm360(gmst);
    },
    angularSeparation: function (a, b) {
      var diff = Math.abs(this.norm360(a) - this.norm360(b));
      if (diff > 180.0) diff = 360.0 - diff;
      return diff;
    }
  };

  var ZODIAC_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

  function signIndexOf(name) { return ZODIAC_SIGNS.indexOf(name); }
  function signIndexOfLongitude(lon) {
    return Math.min(11, Math.max(0, Math.floor(AstroMath.norm360(lon) / 30.0)));
  }

  // ============================================================
  // Lunar node (mean)
  // ============================================================
  function meanNodeLongitudeFromT(t) {
    var omega = 125.0445479 - 1934.1362891 * t + 0.0020754 * t * t +
      (t * t * t) / 467441.0 - (t * t * t * t) / 60616000.0;
    return AstroMath.norm360(omega);
  }

  // ============================================================
  // House angles (Ascendant / Midheaven)
  // ============================================================
  function computeHouseAngles(jd, latitude, longitude) {
    var t = AstroMath.julianCenturiesJ2000(jd);
    var obliquity = AstroMath.toRad(AstroMath.meanObliquity(t));

    var gmst = AstroMath.gmstDegrees(jd);
    var omegaMoonNode = AstroMath.toRad(meanNodeLongitudeFromT(t));
    var nutationInLongitudeDeg = (-17.2 * Math.sin(omegaMoonNode)) / 3600.0;
    var equationOfEquinoxes = nutationInLongitudeDeg * Math.cos(obliquity);
    var gast = AstroMath.norm360(gmst + equationOfEquinoxes);

    var lst = AstroMath.norm360(gast + longitude);
    var ramc = AstroMath.toRad(lst);
    var latRad = AstroMath.toRad(latitude);

    var mcY = Math.sin(ramc);
    var mcX = Math.cos(ramc) * Math.cos(obliquity);
    var mc = AstroMath.norm360(AstroMath.toDeg(Math.atan2(mcY, mcX)));

    var ascY = -Math.cos(ramc);
    var ascX = Math.sin(ramc) * Math.cos(obliquity) + Math.tan(latRad) * Math.sin(obliquity);
    var asc = AstroMath.norm360(AstroMath.toDeg(Math.atan2(ascY, ascX)) + 180.0);

    return { ascendant: asc, midheaven: mc };
  }

  // ============================================================
  // Natal ephemeris (daily multi-body table), loaded from ephemeris.json
  // ============================================================
  function NatalEphemeris(data) {
    this.start = new Date(data.start + "T00:00:00Z");
    this.rows = data.rows; // array of [sun,moon,mercury,venus,mars,jupiter,saturn,uranus,neptune,pluto,meanNode,meanLilith]
    this.cols = data.cols;
    this.count = data.count;
  }
  NatalEphemeris.prototype.dayIndex = function (utcDate) {
    var ms = utcDate.getTime() - this.start.getTime();
    return Math.floor(ms / 86400000);
  };
  NatalEphemeris.prototype.covers = function (utcDate) {
    var idx = this.dayIndex(utcDate);
    return idx >= 0 && idx < this.count;
  };
  // utFractionOfDay: 0..1
  NatalEphemeris.prototype.lookup = function (utcDate, utFractionOfDay) {
    if (!this.covers(utcDate)) return null;
    var idx = this.dayIndex(utcDate);
    var row1 = this.rows[idx];
    var row2 = this.rows[Math.min(idx + 1, this.count - 1)];
    var out = {};
    for (var i = 0; i < this.cols.length; i++) {
      var a = row1[i], b = row2[i];
      var diff = b - a;
      if (diff > 180.0) diff -= 360.0;
      if (diff < -180.0) diff += 360.0;
      out[this.cols[i]] = AstroMath.norm360(a + diff * utFractionOfDay);
    }
    return out;
  };

  // ============================================================
  // Transiting Pluto ephemeris (daily longitude + retrograde flag), from pluto.json
  // ============================================================
  function PlutoEphemeris(data) {
    this.start = new Date(data.start + "T00:00:00Z");
    this.lon = data.lon;
    this.retro = data.retro;
    this.count = data.count;
  }
  PlutoEphemeris.prototype.dayIndex = function (utcDate) {
    var ms = utcDate.getTime() - this.start.getTime();
    return Math.floor(ms / 86400000);
  };
  PlutoEphemeris.prototype.covers = function (utcDate) {
    var idx = this.dayIndex(utcDate);
    return idx >= 0 && idx < this.count;
  };
  PlutoEphemeris.prototype.longitudeOn = function (utcDate, fractionOfDay) {
    if (fractionOfDay === undefined) fractionOfDay = 0.5;
    var idx = this.dayIndex(utcDate);
    idx = Math.max(0, Math.min(idx, this.count - 1));
    var nextIdx = Math.min(idx + 1, this.count - 1);
    var a = this.lon[idx], b = this.lon[nextIdx];
    var delta = b - a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return AstroMath.norm360(a + delta * fractionOfDay);
  };
  PlutoEphemeris.prototype.isRetrogradeOn = function (utcDate) {
    var idx = this.dayIndex(utcDate);
    idx = Math.max(0, Math.min(idx, this.count - 1));
    return this.retro[idx] === 1;
  };

  // ============================================================
  // Natal chart calculator
  // ============================================================
  // birth: {year,month,day,hour,minute,utcOffsetHours,latitude,longitude}
  function utDateAndFraction(birth) {
    var utHour = birth.hour + birth.minute / 60.0 - birth.utcOffsetHours;
    var y = birth.year, m = birth.month, d = birth.day;
    while (utHour < 0.0) { utHour += 24.0; d -= 1; }
    while (utHour >= 24.0) { utHour -= 24.0; d += 1; }
    // normalize via Date object (UTC) then adjust
    var base = new Date(Date.UTC(y, m - 1, d));
    return { utcDate: base, fraction: utHour / 24.0 };
  }

  function julianDayUT(birth) {
    var utFractionalHour = birth.hour + birth.minute / 60.0 - birth.utcOffsetHours;
    var jdLocalMidnight = AstroMath.julianDay(birth.year, birth.month, birth.day);
    return jdLocalMidnight + utFractionalHour / 24.0;
  }

  function calculateNatalChart(birth, natalEphemeris) {
    var jd = julianDayUT(birth);
    var udf = utDateAndFraction(birth);
    var fromFile = natalEphemeris.lookup(udf.utcDate, udf.fraction);
    if (!fromFile) {
      throw new Error("Birth date falls outside the supported ephemeris range (1940–2060).");
    }

    var sunLon = fromFile.sun;
    var moonLon = fromFile.moon;
    var mercuryLon = fromFile.mercury;
    var venusLon = fromFile.venus;
    var marsLon = fromFile.mars;
    var jupiterLon = fromFile.jupiter;
    var saturnLon = fromFile.saturn;
    var uranusLon = fromFile.uranus;
    var neptuneLon = fromFile.neptune;
    var plutoLon = fromFile.pluto;
    var northNodeLon = fromFile.meanNode;
    var lilithLon = fromFile.meanLilith;

    var angles = computeHouseAngles(jd, birth.latitude, birth.longitude);

    var sunHouseOffset = AstroMath.norm360(sunLon - angles.ascendant);
    var isDayBirth = sunHouseOffset >= 180.0;
    var fortune = isDayBirth
      ? AstroMath.norm360(angles.ascendant + moonLon - sunLon)
      : AstroMath.norm360(angles.ascendant + sunLon - moonLon);

    var points = [
      { name: "Sun", longitude: sunLon },
      { name: "Moon", longitude: moonLon },
      { name: "Mercury", longitude: mercuryLon },
      { name: "Venus", longitude: venusLon },
      { name: "Mars", longitude: marsLon },
      { name: "Jupiter", longitude: jupiterLon },
      { name: "Saturn", longitude: saturnLon },
      { name: "Uranus", longitude: uranusLon },
      { name: "Neptune", longitude: neptuneLon },
      { name: "Pluto", longitude: plutoLon },
      { name: "North Node", longitude: northNodeLon },
      { name: "Lilith", longitude: lilithLon },
      { name: "Part of Fortune", longitude: fortune },
      { name: "Ascendant", longitude: angles.ascendant },
      { name: "Midheaven", longitude: angles.midheaven }
    ];

    return { points: points };
  }

  // ============================================================
  // Aspect engine (ported: tier-1 zero-crossings + tier-2 grazes)
  // ============================================================
  var ASPECTS = [
    { key: "CONJUNCTION", degrees: 0.0, label: "Conjunct" },
    { key: "SEXTILE", degrees: 60.0, label: "Sextile" },
    { key: "SQUARE", degrees: 90.0, label: "Square" },
    { key: "TRINE", degrees: 120.0, label: "Trine" },
    { key: "OPPOSITION", degrees: 180.0, label: "Opposition" }
  ];

  function signedDiff(a, b) {
    var diff = (a - b) % 360.0;
    if (diff <= -180.0) diff += 360.0;
    if (diff > 180.0) diff -= 360.0;
    return diff;
  }
  function signOf(x) { return x > 0.0 ? 1 : (x < 0.0 ? -1 : 0); }

  function targetLongitudesFor(natalLon, aspect) {
    if (aspect.key === "CONJUNCTION") return [AstroMath.norm360(natalLon)];
    if (aspect.key === "OPPOSITION") return [AstroMath.norm360(natalLon + 180.0)];
    return [
      AstroMath.norm360(natalLon + aspect.degrees),
      AstroMath.norm360(natalLon - aspect.degrees)
    ];
  }

  function addDaysUTC(date, n) {
    return new Date(date.getTime() + n * 86400000);
  }

  function findAspects(plutoEphemeris, chart, startDate, endDate, orbDegrees, offsetDegrees) {
    var results = [];
    if (startDate > endDate) return results;

    var dates = [];
    var shiftedLons = [];
    var retro = [];
    var d = startDate;
    while (d <= endDate) {
      var rawLon = plutoEphemeris.longitudeOn(d);
      dates.push(d);
      shiftedLons.push(AstroMath.norm360(rawLon - offsetDegrees));
      retro.push(plutoEphemeris.isRetrogradeOn(d));
      d = addDaysUTC(d, 1);
    }

    var GRAZE_THRESHOLD_DEGREES = 0.02;

    function buildHit(exactIdx, pointName, aspect) {
      var startIdx = exactIdx, endIdx = exactIdx;
      var target = targetForHit;
      while (startIdx > 0 && Math.abs(signedDiff(shiftedLons[startIdx - 1], target)) <= orbDegrees) startIdx--;
      while (endIdx < dates.length - 1 && Math.abs(signedDiff(shiftedLons[endIdx + 1], target)) <= orbDegrees) endIdx++;
      return {
        date: dates[exactIdx],
        natalPointName: pointName,
        aspectKey: aspect.key,
        aspectLabel: aspect.label,
        retrograde: retro[exactIdx],
        windowStartDate: dates[startIdx],
        windowEndDate: dates[endIdx]
      };
    }

    var targetForHit; // set per-target before calling buildHit

    for (var p = 0; p < chart.points.length; p++) {
      var point = chart.points[p];
      for (var a = 0; a < ASPECTS.length; a++) {
        var aspect = ASPECTS[a];
        var targets = targetLongitudesFor(point.longitude, aspect);
        for (var ti = 0; ti < targets.length; ti++) {
          var target = targets[ti];
          targetForHit = target;

          var diffs = new Array(dates.length);
          var absDiffs = new Array(dates.length);
          for (var i = 0; i < dates.length; i++) {
            diffs[i] = signedDiff(shiftedLons[i], target);
            absDiffs[i] = Math.abs(diffs[i]);
          }

          var crossingIndices = {};
          var prevSign = signOf(diffs[0]);
          var prevDiff = diffs[0];
          for (var k = 1; k < dates.length; k++) {
            var diff = diffs[k];
            var currSign = signOf(diff);
            var isCrossing = false;
            if (currSign === 0 && prevSign !== 0) isCrossing = true;
            else if (prevSign !== 0 && currSign !== 0 && prevSign !== currSign &&
              Math.abs(diff - prevDiff) < 180.0) isCrossing = true;

            if (isCrossing) {
              var exactIdx = Math.abs(prevDiff) < Math.abs(diff) ? k - 1 : k;
              crossingIndices[exactIdx] = true;
              results.push(buildHit(exactIdx, point.name, aspect));
            }
            prevSign = currSign;
            prevDiff = diff;
          }

          // Tier 2: grazes (runs of equal abs value / same sign)
          var runs = [];
          var ii = 0;
          while (ii < dates.length) {
            var jj = ii;
            while (jj + 1 < dates.length && absDiffs[jj + 1] === absDiffs[ii] && signOf(diffs[jj + 1]) === signOf(diffs[ii])) jj++;
            runs.push({ diffValue: diffs[ii], absValue: absDiffs[ii], startIdx: ii, endIdx: jj });
            ii = jj + 1;
          }
          for (var r = 1; r < runs.length - 1; r++) {
            var run = runs[r], prevRun = runs[r - 1], nextRun = runs[r + 1];
            var sameSignThroughout = signOf(prevRun.diffValue) === signOf(run.diffValue) &&
              signOf(run.diffValue) === signOf(nextRun.diffValue) && signOf(run.diffValue) !== 0;
            var isLocalMinimum = run.absValue < prevRun.absValue && run.absValue < nextRun.absValue;
            if (sameSignThroughout && isLocalMinimum && run.absValue <= GRAZE_THRESHOLD_DEGREES) {
              var repIdx = null;
              for (var idx = run.startIdx; idx < run.endIdx; idx++) {
                if (retro[idx] !== retro[idx + 1]) { repIdx = idx + 1; break; }
              }
              var chosenIdx = repIdx !== null ? repIdx : Math.floor((run.startIdx + run.endIdx) / 2);
              if (!crossingIndices[chosenIdx]) {
                results.push(buildHit(chosenIdx, point.name, aspect));
              }
            }
          }
        }
      }
    }

    results.sort(function (x, y) { return x.date - y.date; });
    return results;
  }

  // ============================================================
  // Pluto Phase table + houses + Book of Luck
  // ============================================================
  var PLUTO_PHASE_ERAS = [
    { startYear: 1838, endYear: 1867, sign: "Sagittarius" },
    { startYear: 1868, endYear: 1898, sign: "Capricorn" },
    { startYear: 1899, endYear: 1927, sign: "Aquarius" },
    { startYear: 1928, endYear: 1948, sign: "Pisces" },
    { startYear: 1949, endYear: 1964, sign: "Aries" },
    { startYear: 1965, endYear: 1978, sign: "Taurus" },
    { startYear: 1979, endYear: 1989, sign: "Gemini" },
    { startYear: 1990, endYear: 2002, sign: "Cancer" },
    { startYear: 2003, endYear: 2016, sign: "Leo" },
    { startYear: 2017, endYear: 2032, sign: "Virgo" },
    { startYear: 2033, endYear: 2054, sign: "Libra" },
    { startYear: 2055, endYear: 2082, sign: "Scorpio" },
    { startYear: 2083, endYear: 2111, sign: "Sagittarius" }
  ];
  function eraIndexForYear(year) {
    for (var i = 0; i < PLUTO_PHASE_ERAS.length; i++) {
      var e = PLUTO_PHASE_ERAS[i];
      if (year >= e.startYear && year <= e.endYear) return i;
    }
    return year < PLUTO_PHASE_ERAS[0].startYear ? 0 : PLUTO_PHASE_ERAS.length - 1;
  }
  function bookEraIndex(erasIndex) {
    var b = erasIndex - 1;
    return (b >= 0 && b <= 11) ? b : null;
  }

  var FIRST_HOUSE_TEXT = {
    Aries: "energetic, direct, and highly visible, leading with action and initiative",
    Taurus: "steady, grounded, and focused on security, comfort, and building something durable",
    Gemini: "curious, communicative, and constantly adapting to new information and people",
    Cancer: "nurturing, emotionally attuned, and protective of home and family",
    Leo: "confident, expressive, and drawn to recognition and creative self-expression",
    Virgo: "analytical, detail-oriented, and focused on improvement, service, and precision",
    Libra: "diplomatic, relationship-focused, and driven by fairness and balance",
    Scorpio: "intense, private, and drawn to depth, power, and transformation",
    Sagittarius: "adventurous, optimistic, and focused on growth, exploration, and big ideas",
    Capricorn: "disciplined, ambitious, and focused on structure, patience, and long-term achievement",
    Aquarius: "independent, unconventional, and focused on ideas, innovation, and community",
    Pisces: "sensitive, imaginative, and attuned to intuition, empathy, and spirituality"
  };
  var TENTH_HOUSE_TEXT = {
    Aries: "pioneering fields, competition, sports, the military, or leadership roles",
    Taurus: "finance, agriculture, real estate, or hands-on, tangible work",
    Gemini: "communication, writing, media, teaching, or sales",
    Cancer: "caregiving, hospitality, real estate, or family-oriented work",
    Leo: "entertainment, the arts, leadership, or anything in the public eye",
    Virgo: "healthcare, administration, editing, or detail-driven service work",
    Libra: "law, diplomacy, design, or partnership-based work",
    Scorpio: "research, psychology, finance, or work involving crisis and transformation",
    Sagittarius: "education, publishing, travel, or philosophy and law",
    Capricorn: "government, corporate structure, management, rules, and time-related fields",
    Aquarius: "technology, science, activism, or group and community-oriented work",
    Pisces: "the arts, healing professions, spirituality, or charitable work"
  };
  function computePlutoPhaseHouses(personSignIndex, phaseSignIndex) {
    var offset = (personSignIndex - phaseSignIndex) % 12;
    if (offset < 0) offset += 12;
    var first = offset;
    var tenth = (offset + 9) % 12;
    return { firstHouseSignIndex: first, tenthHouseSignIndex: tenth,
      firstHouseSign: ZODIAC_SIGNS[first], tenthHouseSign: ZODIAC_SIGNS[tenth] };
  }
  function plutoPhaseHousesIntroText(hs) {
    var firstDesc = FIRST_HOUSE_TEXT[hs.firstHouseSign] || "";
    var tenthDesc = TENTH_HOUSE_TEXT[hs.tenthHouseSign] || "";
    return hs.firstHouseSign + " in the 1st house means the overall life situation and energy tend to be " +
      firstDesc + ". " + hs.tenthHouseSign + " in the 10th house means career and public accomplishment " +
      "are most likely tied to " + tenthDesc + ".";
  }

  // Book of Luck cycles
  var COLOR_CYCLE = [
    ["red", "gold", "purple"], ["aquamarine", "white", "black"], ["blue", "yellow", "pink"],
    ["brown", "green", "tan"], ["purple", "gold", "red"], ["black", "aquamarine", "white"],
    ["pink", "blue", "yellow"], ["tan", "brown", "green"], ["gold", "purple", "red"],
    ["white", "black", "aquamarine"], ["yellow", "pink", "blue"], ["green", "tan", "brown"]
  ];
  var NUMBER_CYCLE = [
    [1, 5, 9], [12, 4, 8], [11, 3, 7], [10, 2, 6], [9, 1, 5], [8, 12, 4],
    [7, 11, 3], [6, 10, 2], [5, 9, 1], [4, 8, 12], [3, 7, 11], [2, 6, 10]
  ];
  var PEOPLE_CYCLE = [
    ["Aries", "Leo", "Sagittarius"], ["Pisces", "Cancer", "Scorpio"], ["Aquarius", "Gemini", "Libra"],
    ["Capricorn", "Taurus", "Virgo"], ["Sagittarius", "Aries", "Leo"], ["Scorpio", "Pisces", "Cancer"],
    ["Libra", "Aquarius", "Gemini"], ["Virgo", "Capricorn", "Taurus"], ["Leo", "Sagittarius", "Aries"],
    ["Cancer", "Scorpio", "Pisces"], ["Gemini", "Libra", "Aquarius"], ["Taurus", "Virgo", "Capricorn"]
  ];
  function cycleIndex(signIndex, bookEra, offset) {
    offset = offset || 0;
    var i = (bookEra - signIndex + offset) % 12;
    if (i < 0) i += 12;
    return i;
  }
  function bookOfLuck(signIndex, bookEra, unlucky) {
    var idx = cycleIndex(signIndex, bookEra, unlucky ? 2 : 0);
    return { colors: COLOR_CYCLE[idx], numbers: NUMBER_CYCLE[idx], people: PEOPLE_CYCLE[idx] };
  }

  // ============================================================
  // Keyword matching (no AI) — maps event description to natal points
  // ============================================================
  var KEYWORDS = {
    "Sun": ["career", "promotion", "promoted", "boss", "leadership", "leader", "job", "award", "recognition",
      "father", "authority", "business launch", "launched", "ceo", "president", "health", "heart", "confidence"],
    "Moon": ["home", "family", "move", "moved", "moving", "relocate", "relocated", "mother", "pregnancy",
      "pregnant", "baby", "child", "birth", "emotional", "house", "property", "apartment"],
    "Mercury": ["contract", "signed", "communication", "email", "travel", "trip", "study", "studying", "school",
      "college", "exam", "interview", "negotiation", "sibling", "brother", "sister", "writing", "book",
      "technology", "website", "deal", "agreement"],
    "Venus": ["relationship", "love", "boyfriend", "girlfriend", "partner", "marriage", "married", "engaged",
      "engagement", "wedding", "breakup", "broke up", "divorce", "money", "finance", "salary", "raise",
      "art", "beauty", "date", "dating"],
    "Mars": ["conflict", "fight", "accident", "injury", "injured", "surgery", "competition", "sports",
      "anger", "argument", "military", "war", "aggressive", "attack", "assault"],
    "Jupiter": ["luck", "opportunity", "growth", "expanded", "expansion", "abroad", "education", "degree",
      "graduated", "publishing", "published", "legal win", "won", "lawsuit", "gain", "windfall", "scholarship"],
    "Saturn": ["loss", "restriction", "delay", "delayed", "discipline", "responsibility", "death", "died",
      "illness", "sick", "structure", "layoff", "laid off", "fired", "retirement", "retired", "debt",
      "obligation", "limit"],
    "Uranus": ["sudden", "unexpected", "shock", "shocking", "revolution", "freedom", "quit", "divorce",
      "breakthrough", "innovation", "surprise"],
    "Neptune": ["confusion", "confused", "spiritual", "addiction", "dream", "art", "loss", "fog", "escape",
      "deception", "lied", "betrayed", "illness"],
    "Pluto": ["transformation", "transformed", "crisis", "death", "died", "power", "obsession", "rebirth",
      "intense", "control", "secret", "affair", "scandal"],
    "North Node": ["destiny", "purpose", "new direction", "path", "calling", "meant to be"],
    "Lilith": ["rebellion", "taboo", "sexuality", "shadow", "empowerment", "hidden"],
    "Part of Fortune": ["fortune", "luck", "windfall", "prosperity", "gain", "success", "won", "lottery"],
    "Ascendant": ["identity", "appearance", "new beginning", "began", "started", "reinvent", "image"],
    "Midheaven": ["career", "reputation", "public", "status", "promotion", "calling", "recognition", "fame"]
  };

  function keywordScore(pointName, description) {
    if (!description) return 0;
    var text = description.toLowerCase();
    var words = KEYWORDS[pointName] || [];
    var score = 0;
    for (var i = 0; i < words.length; i++) {
      if (text.indexOf(words[i]) !== -1) score++;
    }
    return score;
  }

  // ============================================================
  // Public: compute a full explanation for a given birth+event input
  // ============================================================
  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function explainEvent(input, data) {
    var natalEph = new NatalEphemeris(data.ephemeris);
    var plutoEph = new PlutoEphemeris(data.pluto);

    var birth = {
      year: input.birthYear, month: input.birthMonth, day: input.birthDay,
      hour: input.birthHour, minute: input.birthMinute,
      utcOffsetHours: input.utcOffsetHours,
      latitude: input.latitude, longitude: input.longitude
    };

    var chart = calculateNatalChart(birth, natalEph);

    var eventDateUTC = new Date(Date.UTC(input.eventYear, input.eventMonth - 1, input.eventDay));

    // Scan window: exact hits' "active window" half-width is bounded by
    // orbDegrees / Pluto's daily motion (~0.004 deg/day) ≈ 2 years for orb=3.
    // Scan +/- 4 years around the event date to be safe, clamped to Pluto
    // ephemeris coverage (1950-01-01 .. its last date) and to the birth date.
    var plutoStart = plutoEph.start;
    var plutoEnd = addDaysUTC(plutoEph.start, plutoEph.count - 1);
    var birthDateUTC = new Date(Date.UTC(input.birthYear, input.birthMonth - 1, input.birthDay));

    var scanStart = addDaysUTC(eventDateUTC, -4 * 366);
    var scanEnd = addDaysUTC(eventDateUTC, 4 * 366);
    if (scanStart < birthDateUTC) scanStart = birthDateUTC;
    if (scanStart < plutoStart) scanStart = plutoStart;
    if (scanEnd > plutoEnd) scanEnd = plutoEnd;

    var offsetDegrees = input.offsetDegrees || 135.0;
    var orbDegrees = input.orbDegrees || 3.0;

    var hits = findAspects(plutoEph, chart, scanStart, scanEnd, orbDegrees, offsetDegrees);

    // Active hits: those whose window contains the event date
    var active = hits.filter(function (h) {
      return h.windowStartDate <= eventDateUTC && eventDateUTC <= h.windowEndDate;
    });

    var usedFallback = false;
    if (active.length === 0) {
      // fall back to nearest hit(s) by exact date
      hits.sort(function (x, y) {
        return Math.abs(x.date - eventDateUTC) - Math.abs(y.date - eventDateUTC);
      });
      active = hits.slice(0, 3);
      usedFallback = true;
    }

    // Score + sort: keyword relevance first, then closeness to exact date
    active.forEach(function (h) {
      h.keywordScore = keywordScore(h.natalPointName, input.description);
      h.daysFromExact = Math.abs(daysBetween(h.date, eventDateUTC));
    });
    active.sort(function (x, y) {
      if (y.keywordScore !== x.keywordScore) return y.keywordScore - x.keywordScore;
      return x.daysFromExact - y.daysFromExact;
    });

    // attach interpretation text
    active.forEach(function (h) {
      var lib = data.interpretations[h.natalPointName];
      h.interpretation = lib ? lib[h.aspectLabel] : "";
      h.uncertaintyDays = 4;
    });

    var top = active.slice(0, 5);

    // Era + houses + book of luck
    var eIdx = eraIndexForYear(input.eventYear);
    var era = PLUTO_PHASE_ERAS[eIdx];
    var eraSignIndex = signIndexOf(era.sign);

    var personLon = input.personPoint === "Moon"
      ? chart.points.filter(function (p) { return p.name === "Moon"; })[0].longitude
      : chart.points.filter(function (p) { return p.name === "Sun"; })[0].longitude;
    var personSignIndex = signIndexOfLongitude(personLon);
    var personSign = ZODIAC_SIGNS[personSignIndex];

    var houses = computePlutoPhaseHouses(personSignIndex, eraSignIndex);
    var housesIntro = plutoPhaseHousesIntroText(houses);

    var bIdx = bookEraIndex(eIdx);
    var luck = null;
    if (bIdx !== null) {
      luck = {
        lucky: bookOfLuck(personSignIndex, bIdx, false),
        unlucky: bookOfLuck(personSignIndex, bIdx, true)
      };
    }

    return {
      era: era,
      personSign: personSign,
      houses: houses,
      housesIntro: housesIntro,
      luck: luck,
      hits: top,
      usedFallback: usedFallback,
      eventDate: eventDateUTC
    };
  }

  // ============================================================
  // Data loading (cached across calls within a page load)
  // ============================================================
  var _dataPromise = null;
  function loadData() {
    if (_dataPromise) return _dataPromise;
    _dataPromise = Promise.all([
      fetch(BASE_URL + "ephemeris.json").then(function (r) { return r.json(); }),
      fetch(BASE_URL + "pluto.json").then(function (r) { return r.json(); }),
      fetch(BASE_URL + "interpretations.json").then(function (r) { return r.json(); })
    ]).then(function (results) {
      return { ephemeris: results[0], pluto: results[1], interpretations: results[2] };
    });
    return _dataPromise;
  }

  // ============================================================
  // Geocoding (OpenStreetMap Nominatim — free, no API key)
  // ============================================================
  function geocodePlace(placeName) {
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(placeName);
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        if (!results || results.length === 0) {
          throw new Error("Could not find that location. Try a nearby larger city, or enter coordinates directly.");
        }
        return { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon), displayName: results[0].display_name };
      });
  }

  // ============================================================
  // Expose
  // ============================================================
  window.PlutoPhasesEngine = {
    explainEvent: explainEvent,
    loadData: loadData,
    geocodePlace: geocodePlace,
    ZODIAC_SIGNS: ZODIAC_SIGNS
  };
})();
