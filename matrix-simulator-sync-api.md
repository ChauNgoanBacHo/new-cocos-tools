# Matrix Simulator Sync API

API spec cho việc lưu, fetch, publish và import dữ liệu `Matrix Simulator` qua Node.js server nội bộ.

Tài liệu này mô tả data của `matrix detail` khi sync qua server.

`matrix detail` canonical payload vẫn không cần nhúng metadata gameplay nội bộ, nhưng server v2 sẽ bọc thêm metadata quản trị để phục vụ list theo game:

- `gameId`
- `publishedBy`
- các state UI local như `isExpanded`

---

## Design Goals

1. Root payload gọn, dễ validate.
2. Chỉ giữ 3 field cốt lõi ở root:
   - `title`
   - `matrixData`
   - `tableFormat`
3. Toàn bộ field phụ hiện có đưa vào `additionalData`.
4. Cho phép field phụ linh hoạt về sau mà không phải đổi contract lớn.

---

## Authentication

Khuyến nghị dùng internal API key.

Header:

```http
Authorization: Bearer <INTERNAL_API_KEY>
```

Hoặc:

```http
x-internal-api-key: <INTERNAL_API_KEY>
```

Nếu hệ thống nội bộ chưa cần auth ở v1 thì có thể bỏ qua tạm, nhưng contract nên chừa sẵn.

---

## Canonical Data Shape

### Matrix Template

```json
{
  "id": "mtx_tpl_9704_fs_001",
  "slug": "free-win-1",
  "title": "Free Win 1",
  "matrixData": "3,3,3,J,7,Q,6,7,8,2,7,4,3,K,Q,7,Q,7,8,6",
  "tableFormat": "3,3,3,3,3",
  "additionalData": {
    "stackedReel1": "3,3,3",
    "stackedReel5": "8,8,8",
    "stackedCodeReel1": "W",
    "stackedCodeReel5": "B",
    "megaSymbolCode": "M1",
    "megaSymbolFormat": "2x2",
    "jackpotTypeLeft": "mini",
    "jackpotTypeRight": "major",
    "powerUpSymbolCode": "L",
    "matrixLightningData": "1,0,1,0,0",
    "jackpotType": "progressive"
  },
  "tags": ["freegame", "win", "staging"],
  "notes": "Imported from internal Electron app",
  "version": 1,
  "createdAt": "2026-06-21T10:00:00.000Z",
  "updatedAt": "2026-06-21T10:00:00.000Z"
}
```

---

## Field Definition

## Root Fields

### `title`

- type: `string`
- required: `false`
- source UI: field `Title`
- note:
  - có thể rỗng
  - nên trim trước khi lưu
  - chỉ mang tính label để user dễ nhận biết

### `matrixData`

- type: `string`
- required: `true`
- source UI: field `Matrix`
- note:
  - đây là field bắt buộc quan trọng nhất
  - không được rỗng
  - server không cần chuẩn hóa toàn bộ token ở v1, nhưng nên trim

### `tableFormat`

- type: `string`
- required: `true`
- source UI: field `Table Format`
- note:
  - ví dụ: `"3,3,3,3,3"`
  - phải parse được thành danh sách số dương
  - phục vụ validate và preview matrix

## Flexible Field Container

### `additionalData`

- type: `object`
- required: `false`
- source UI: section `Additional Data`
- note:
  - chỉ chứa field phụ của matrix detail
  - field có thể thiếu hoàn toàn
  - field có thể là string rỗng ở local, nhưng khi publish nên bỏ field rỗng để payload sạch hơn

---

## Known Additional Fields

Đây là bộ field hiện đang có trong app.

Tất cả đều:

- type: `string`
- required: `false`
- nullable: `omitted is preferred`

### Current Known Keys

```json
{
  "stackedReel1": "string",
  "stackedReel5": "string",
  "stackedCodeReel1": "string",
  "stackedCodeReel5": "string",
  "megaSymbolCode": "string",
  "megaSymbolFormat": "string",
  "jackpotTypeLeft": "string",
  "jackpotTypeRight": "string",
  "powerUpSymbolCode": "string",
  "matrixLightningData": "string",
  "jackpotType": "string"
}
```

### Meaning

- `stackedReel1`
  Data mô tả stacked symbol cho reel 1
- `stackedReel5`
  Data mô tả stacked symbol cho reel 5
- `stackedCodeReel1`
  Code cho stacked reel 1
- `stackedCodeReel5`
  Code cho stacked reel 5
- `megaSymbolCode`
  Code cho mega symbol
- `megaSymbolFormat`
  Format mega symbol, ví dụ `2x2`
- `jackpotTypeLeft`
  Jackpot type phía trái
- `jackpotTypeRight`
  Jackpot type phía phải
- `powerUpSymbolCode`
  Code của power-up symbol
- `matrixLightningData`
  Data riêng cho lightning / highlight logic
- `jackpotType`
  Jackpot type tổng quát nếu game chỉ dùng 1 field

---

## Flexible Field Policy

Server nên hỗ trợ 2 mức:

### Known Flexible Fields

- accept
- lưu nguyên giá trị
- có thể hiển thị riêng trên UI về sau

### Unknown Flexible Fields

- vẫn accept nếu nằm trong `additionalData`
- lưu nguyên dạng key/value string

Điều này giúp app mở rộng field mới mà không phải chờ backend deploy trước.

---

## Publish Payload

`POST /api/matrix-templates`

### Request Body

```json
{
  "gameId": "9704",
  "title": "Free Win 1",
  "matrixData": "3,3,3,J,7,Q,6,7,8,2,7,4,3,K,Q,7,Q,7,8,6",
  "tableFormat": "3,3,3,3,3",
  "additionalData": {
    "stackedReel1": "3,3,3",
    "stackedReel5": "8,8,8",
    "jackpotTypeLeft": "mini"
  },
  "tags": ["freegame", "share"],
  "notes": "Published from Electron local app"
}
```

### Success Response

```json
{
  "ok": true,
  "item": {
    "id": "mtx_tpl_9704_fs_001",
    "gameId": "9704",
    "slug": "free-win-1",
    "title": "Free Win 1",
    "matrixData": "3,3,3,J,7,Q,6,7,8,2,7,4,3,K,Q,7,Q,7,8,6",
    "tableFormat": "3,3,3,3,3",
    "additionalData": {
      "stackedReel1": "3,3,3",
      "stackedReel5": "8,8,8",
      "jackpotTypeLeft": "mini"
    },
    "version": 1,
    "createdAt": "2026-06-21T10:00:00.000Z",
    "updatedAt": "2026-06-21T10:00:00.000Z"
  }
}
```

---

## Update Payload

`PUT /api/matrix-templates/:id`

### Request Body

```json
{
  "gameId": "9704",
  "title": "Free Win 1 Updated",
  "matrixData": "3,3,3,J,7,Q,6,7,8,2,7,4,3,K,Q,7,Q,7,8,6",
  "tableFormat": "3,3,3,3,3",
  "additionalData": {
    "stackedReel1": "3,3,3",
    "stackedReel5": "8,8,8",
    "powerUpSymbolCode": "L"
  },
  "version": 1
}
```

### Current Behavior

- API này đã được implement trên server.
- Có thể update:
  - `gameId`
  - `title`
  - `matrixData`
  - `tableFormat`
  - `additionalData`
  - `tags`
  - `notes`
- Nếu update từ server UI thì route form hiện tại là:
  - `GET /matrix-simulator/templates/:id/edit`
  - `POST /matrix-simulator/templates/:id/edit`

### Conflict Response

```json
{
  "ok": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Template was updated by another client.",
    "currentVersion": 2
  }
}
```

---

## List Templates

`GET /api/matrix-templates`

### Suggested Query Params

- `gameId`
  filter theo game id, ví dụ `9704`
- `q`
  search theo title / slug / tags
- `limit`
- `cursor`
- `tag`
- `updatedAfter`

### Response

```json
{
  "ok": true,
  "items": [
    {
      "id": "mtx_tpl_9704_fs_001",
      "gameId": "9704",
      "slug": "free-win-1",
      "title": "Free Win 1",
      "tableFormat": "3,3,3,3,3",
      "tags": ["freegame", "share"],
      "version": 2,
      "updatedAt": "2026-06-21T10:00:00.000Z"
    },
    {
      "id": "mtx_tpl_9704_jp_001",
      "gameId": "9704",
      "slug": "jackpot-major",
      "title": "Jackpot Major",
      "tableFormat": "3,3,3,3,3",
      "tags": ["jackpot"],
      "version": 1,
      "updatedAt": "2026-06-20T09:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

---

## Get Template Detail

`GET /api/matrix-templates/:id`

### Response

```json
{
  "ok": true,
  "item": {
    "id": "mtx_tpl_9704_fs_001",
    "gameId": "9704",
    "slug": "free-win-1",
    "title": "Free Win 1",
    "matrixData": "3,3,3,J,7,Q,6,7,8,2,7,4,3,K,Q,7,Q,7,8,6",
    "tableFormat": "3,3,3,3,3",
    "additionalData": {
      "stackedReel1": "3,3,3",
      "stackedReel5": "8,8,8",
      "jackpotTypeLeft": "mini"
    },
    "tags": ["freegame", "share"],
    "notes": "Published from Electron local app",
    "version": 2,
    "createdAt": "2026-06-20T09:00:00.000Z",
    "updatedAt": "2026-06-21T10:00:00.000Z"
  }
}
```

---

## Matrix Game Catalog

Server hiện có thêm game catalog riêng để UI list game và đi vào detail theo từng `gameId`.

### List Games

`GET /api/matrix-games`

### Response

```json
{
  "ok": true,
  "items": [
    {
      "gameId": "9704",
      "gameName": "Bad Boo Bae",
      "createdAt": "2026-06-21T10:00:00.000Z",
      "updatedAt": "2026-06-21T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

### Create Game

`POST /api/matrix-games`

### Request Body

```json
{
  "gameId": "9704",
  "gameName": "Bad Boo Bae"
}
```

### Update Game

`PUT /api/matrix-games/:gameId`

### Request Body

```json
{
  "gameId": "9705",
  "gameName": "Bad Boo Bae X"
}
```

### Notes

- Nếu đổi `gameId`, server sẽ tự reassign toàn bộ matrix template từ `gameId` cũ sang `gameId` mới.
- Đây là behavior hiện tại của server để tránh lệch data giữa game catalog và matrix template.

### Delete Game

`DELETE /api/matrix-games/:gameId`

### Notes

- Chỉ delete được khi game đó không còn matrix template.
- Nếu vẫn còn matrix, server trả:
  - `409 MATRIX_GAME_NOT_EMPTY`

---

## List Templates By Game

`GET /api/matrix-templates/by-game/:gameId`

### Example

`GET /api/matrix-templates/by-game/9704`

### Response

```json
{
  "ok": true,
  "gameId": "9704",
  "items": [
    {
      "id": "mtx_tpl_9704_fs_001",
      "gameId": "9704",
      "slug": "free-win-1",
      "title": "Free Win 1",
      "tableFormat": "3,3,3,3,3",
      "tags": ["freegame", "share"],
      "version": 2,
      "updatedAt": "2026-06-21T10:00:00.000Z"
    }
  ],
  "nextCursor": null,
  "total": 1
}
```

---

## Import Mapping For Electron

Khi Electron import một template từ API về local panel:

### Map Root

- `title` -> `panel.title`
- `matrixData` -> `panel.matrixData`
- `tableFormat` -> `panel.tableFormat`

### Map Flexible

- `additionalData[key]` -> `panel[key]` nếu key đang tồn tại trong local app
- với unknown key:
  - v1 có thể bỏ qua khi import vào UI hiện tại
  - hoặc lưu tạm nếu sau này app thêm field động

### Local UI State Must Be Generated Fresh

- `panel.id`
- `panel.isExpanded`
- `panel.isAdditionalExpanded`

---

## Validation Rules

## Required

- `matrixData` must be a non-empty string
- `tableFormat` must be a non-empty string

## Recommended

- `title` trim before save
- remove empty-string entries from `additionalData`
- reject non-object `additionalData`
- reject arrays for `additionalData`

## Example Invalid Response

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "matrixData and tableFormat are required.",
    "fields": {
      "matrixData": "Required",
      "tableFormat": "Required"
    }
  }
}
```

---

## Suggested Storage Shape

Nếu dùng SQL:

- `id`
- `slug`
- `title`
- `matrix_data`
- `table_format`
- `additional_data_json`
- `tags_json`
- `notes`
- `version`
- `created_at`
- `updated_at`

Nếu dùng Mongo / document store:

- lưu gần như nguyên payload canonical

---

## Recommended V1 Endpoints

1. `GET /api/matrix-templates`
2. `GET /api/matrix-templates/by-game/:gameId`
3. `GET /api/matrix-templates/:id`
4. `POST /api/matrix-templates`
5. `PUT /api/matrix-templates/:id`
6. `GET /api/matrix-games`
7. `POST /api/matrix-games`
8. `PUT /api/matrix-games/:gameId`
9. Delete game chỉ dùng nội bộ khi game không còn matrix
10. Delete matrix hiện vẫn đi từ server UI admin ở v1, không mở cho Electron app

---

## Recommendation For V1 Electron UI

- `Fetch from API` gọi `GET /api/matrix-templates/by-game/<gameId>`
- `Import` gọi `GET /api/matrix-templates/:id`
- `Publish` gọi `POST /api/matrix-templates`
- `Update Remote` gọi `PUT /api/matrix-templates/:id`
- `List Game Catalog` gọi `GET /api/matrix-games`
- `Create Game Catalog` gọi `POST /api/matrix-games`
- `Update Game Catalog` gọi `PUT /api/matrix-games/:gameId`

---

## Server Admin UI

Server có thể expose một trang admin nội bộ, ví dụ:

- `GET /matrix-simulator`
- `GET /matrix-simulator/games`
- `GET /matrix-simulator/games/:gameId`
- `GET /matrix-simulator/templates/:id/edit`

Trang này dùng để:

- xem list matrix đã publish
- xem list game catalog
- create / edit / delete game id
- click vào từng game để xem matrix theo game
- filter theo `gameId`
- tạo matrix mới theo `gameId`
- edit matrix detail trực tiếp trên server
- delete record trực tiếp trên server

Luồng này đủ đơn giản để triển khai nhanh mà vẫn không khóa app vào schema cứng.