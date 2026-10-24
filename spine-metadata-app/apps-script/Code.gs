const CONFIG = {
  SPREADSHEET_ID: '1DN0nNy7uIxcUnqMqNwRSHBaCU_WnKWkzudMbjXvhac8',
  HEADERS: [
    'id',
    'gameId',
    'spineName',
    'animationName',
    'previewTimeSec',
    'placement',
    'playCondition',
    'updatedAt',
    'updatedBy',
    'needsDevInput',
  ],
};

function doGet(event) {
  return handleRequest_(event && event.parameter ? event.parameter : {});
}

function doPost(event) {
  try {
    const body = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    return handleRequest_(body);
  } catch (error) {
    return json_({ ok: false, code: 'INVALID_JSON', error: String(error.message || error) });
  }
}

function authorize() {
  return listGames_();
}

function handleRequest_(request) {
  try {
    switch (request.action) {
      case 'listGames':
        return json_({ ok: true, data: listGames_() });
      case 'getGame':
        return json_({ ok: true, data: getGame_(requiredGameId_(request.gameId)) });
      case 'upsertAnimation':
        return json_({ ok: true, data: upsertAnimation_(request.row) });
      case 'upsertMany':
        return json_({ ok: true, data: upsertMany_(requiredGameId_(request.gameId), request.rows || []) });
      case 'setSpineNeedsDevInput':
        return json_({
          ok: true,
          data: setSpineNeedsDevInput_(
            requiredGameId_(request.gameId),
            request.spineName,
            request.needsDevInput
          ),
        });
      default:
        return json_({ ok: false, code: 'UNKNOWN_ACTION', error: 'Unknown action.' });
    }
  } catch (error) {
    return json_({ ok: false, code: error.code || 'SERVER_ERROR', error: String(error.message || error) });
  }
}

function spreadsheet_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function listGames_() {
  return spreadsheet_()
    .getSheets()
    .map(function(sheet) { return sheet.getName(); })
    .filter(function(name) { return /^\d+$/.test(name); })
    .sort();
}

function requiredGameId_(value) {
  const gameId = String(value || '').trim();
  if (!/^\d+$/.test(gameId)) {
    throw apiError_('INVALID_GAME_ID', 'Game ID must contain numbers only.');
  }
  return gameId;
}

function sheetForGame_(gameId) {
  const sheet = spreadsheet_().getSheetByName(gameId);
  if (!sheet) {
    throw apiError_('TAB_NOT_FOUND', 'Cannot find Sheet tab "' + gameId + '".');
  }
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
  const current = headerRange.getValues()[0];
  const isEmpty = current.every(function(value) { return value === ''; });
  if (isEmpty) {
    headerRange.setValues([CONFIG.HEADERS]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }
  const previousHeadersValid = CONFIG.HEADERS
    .slice(0, -1)
    .every(function(header, index) { return current[index] === header; });
  if (previousHeadersValid && current[CONFIG.HEADERS.length - 1] === '') {
    sheet.getRange(1, CONFIG.HEADERS.length).setValue(CONFIG.HEADERS[CONFIG.HEADERS.length - 1]);
    sheet.getRange(1, CONFIG.HEADERS.length).setFontWeight('bold');
    return;
  }
  const valid = CONFIG.HEADERS.every(function(header, index) { return current[index] === header; });
  if (!valid) {
    throw apiError_('INVALID_HEADERS', 'Tab "' + sheet.getName() + '" does not use the Spine Notes header format.');
  }
}

function getGame_(gameId) {
  const sheet = sheetForGame_(gameId);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { gameId: gameId, rows: [] };
  const values = sheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.length).getValues();
  return {
    gameId: gameId,
    rows: values.filter(function(row) { return row[0]; }).map(rowFromValues_),
  };
}

function upsertAnimation_(input) {
  if (!input || typeof input !== 'object') {
    throw apiError_('INVALID_ROW', 'Animation row is required.');
  }
  const gameId = requiredGameId_(input.gameId);
  const sheet = sheetForGame_(gameId);
  const row = normalizeRow_(input, gameId);
  const rowNumber = findRowNumber_(sheet, row.id);
  sheet.getRange(rowNumber || sheet.getLastRow() + 1, 1, 1, CONFIG.HEADERS.length).setValues([valuesFromRow_(row)]);
  return row;
}

function upsertMany_(gameId, inputs) {
  const sheet = sheetForGame_(gameId);
  const current = getGame_(gameId).rows;
  const currentById = {};
  const syncedById = {};
  current.forEach(function(row) { currentById[row.id] = row; });

  (Array.isArray(inputs) ? inputs : []).forEach(function(input) {
    const normalized = normalizeRow_(input, gameId);
    const previous = currentById[normalized.id];
    syncedById[normalized.id] = previous
      ? Object.assign({}, normalized, {
          previewTimeSec: previous.previewTimeSec,
          placement: previous.placement,
          playCondition: previous.playCondition,
          updatedAt: previous.updatedAt,
          updatedBy: previous.updatedBy,
          needsDevInput: previous.needsDevInput,
        })
      : normalized;
  });

  const rows = Object.keys(syncedById).map(function(id) { return syncedById[id]; }).sort(function(a, b) {
    return (a.spineName + '\u0000' + a.animationName).localeCompare(b.spineName + '\u0000' + b.animationName);
  });
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.HEADERS.length).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, CONFIG.HEADERS.length).setValues(rows.map(valuesFromRow_));
  }
  return { gameId: gameId, rows: rows };
}

function setSpineNeedsDevInput_(gameId, rawSpineName, rawNeedsDevInput) {
  const spineName = String(rawSpineName || '').trim();
  if (!spineName) {
    throw apiError_('INVALID_SPINE_NAME', 'Spine name is required.');
  }

  const sheet = sheetForGame_(gameId);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return getGame_(gameId);

  const values = sheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.length).getValues();
  const spineNameIndex = CONFIG.HEADERS.indexOf('spineName');
  const flagIndex = CONFIG.HEADERS.indexOf('needsDevInput');
  const updatedAtIndex = CONFIG.HEADERS.indexOf('updatedAt');
  const updatedByIndex = CONFIG.HEADERS.indexOf('updatedBy');
  const needsDevInput = rawNeedsDevInput === true || String(rawNeedsDevInput).toLowerCase() === 'true';
  const updatedAt = new Date().toISOString();
  const updatedBy = Session.getActiveUser().getEmail() || '';
  let changed = false;

  values.forEach(function(row) {
    if (String(row[spineNameIndex]) !== spineName) return;
    row[flagIndex] = needsDevInput;
    row[updatedAtIndex] = updatedAt;
    row[updatedByIndex] = updatedBy;
    changed = true;
  });

  if (!changed) {
    throw apiError_('SPINE_NOT_FOUND', 'Cannot find Spine "' + spineName + '" in tab "' + gameId + '".');
  }

  sheet.getRange(2, 1, values.length, CONFIG.HEADERS.length).setValues(values);
  return getGame_(gameId);
}

function normalizeRow_(input, gameId) {
  const spineName = String(input.spineName || '').trim();
  const animationName = String(input.animationName || '').trim();
  if (!spineName || !animationName) {
    throw apiError_('INVALID_ROW', 'Spine name and animation name are required.');
  }
  return {
    id: String(input.id || [gameId, spineName, animationName].map(encodeURIComponent).join('::')),
    gameId: gameId,
    spineName: spineName,
    animationName: animationName,
    previewTimeSec: Number(input.previewTimeSec) || 0,
    placement: String(input.placement || ''),
    playCondition: String(input.playCondition || ''),
    updatedAt: new Date().toISOString(),
    updatedBy: Session.getActiveUser().getEmail() || '',
    needsDevInput: input.needsDevInput === true || String(input.needsDevInput).toLowerCase() === 'true',
  };
}

function findRowNumber_(sheet, id) {
  if (sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let index = 0; index < ids.length; index += 1) {
    if (String(ids[index][0]) === id) return index + 2;
  }
  return 0;
}

function valuesFromRow_(row) {
  return CONFIG.HEADERS.map(function(header) { return row[header] === undefined ? '' : row[header]; });
}

function rowFromValues_(values) {
  const row = {};
  CONFIG.HEADERS.forEach(function(header, index) { row[header] = values[index]; });
  row.previewTimeSec = Number(row.previewTimeSec) || 0;
  row.needsDevInput = row.needsDevInput === true || String(row.needsDevInput).toLowerCase() === 'true';
  return row;
}

function apiError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
