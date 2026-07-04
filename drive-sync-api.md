# Drive Sync API

API contract cho bot Drive Asset để app Electron nội bộ poll thay đổi từ Google Drive và tự download asset về đúng cây thư mục local.

## Mục tiêu

Electron app cần làm được 3 việc:

1. Lấy danh sách watched roots đang active
2. Poll change feed theo cursor
3. Download file khi gặp `added` hoặc `updated`

Bot sẽ là source of truth cho change detection. Electron không tự diff Google Drive, chỉ consume API.

---

## Auth

Khuyến nghị dùng internal API key.

Header:

```http
Authorization: Bearer <INTERNAL_API_KEY>
```

Hoặc có thể dùng:

```http
x-internal-api-key: <INTERNAL_API_KEY>
```

Nếu thiếu hoặc sai key:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid internal API key."
  }
}
```

Nếu backend không set `INTERNAL_API_KEY` thì các endpoint nội bộ này vẫn truy cập được mà không cần header auth.

---

## 1. Get Watch Folders

`GET /api/drive/watch-folders`

Trả về các root folder đang được bot theo dõi.

### Response

```json
{
  "ok": true,
  "items": [
    {
      "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
      "rootFolderName": "9704-ArtAssets",
      "rootFolderPath": "9704-ArtAssets",
      "webViewLink": "https://drive.google.com/drive/folders/19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
      "mentionUserIds": ["1234567890", "2345678901"]
    },
    {
      "rootFolderId": "1xOSJu3oFYFrtQCxuL5yFm1i4RMU6oV1h",
      "rootFolderName": "9728-ArtAssets",
      "rootFolderPath": "9728-ArtAssets",
      "webViewLink": "https://drive.google.com/drive/folders/1xOSJu3oFYFrtQCxuL5yFm1i4RMU6oV1h",
      "mentionUserIds": []
    }
  ]
}
```

### Electron usage

Electron dùng danh sách này để map Drive root sang local root, ví dụ:

- `9704-ArtAssets` -> `D:\Assets\9704-ArtAssets`
- `9728-ArtAssets` -> `D:\Assets\9728-ArtAssets`

---

## 2. Get Change Feed

`GET /api/drive/changes?cursor=<cursor>&limit=100`

Nếu client mới hoàn toàn và chưa có cursor:

```http
GET /api/drive/changes?limit=100
```

### Query params

- `cursor`
  Cursor lần poll trước. Có thể là `eventId` hoặc sequence-based cursor.
- `limit`
  Số event tối đa muốn lấy trong 1 lần, ví dụ `100`.

### Response

```json
{
  "ok": true,
  "cursor": "evt_20260616_000125",
  "nextCursor": "evt_20260616_000131",
  "hasMore": true,
  "items": [
    {
      "eventId": "evt_20260616_000126",
      "sequence": 126,
      "occurredAt": "2026-06-16T03:10:40.000Z",
      "action": "added",
      "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
      "rootFolderName": "9704-ArtAssets",
      "parentFolderId": "folder_ui_01",
      "parentFolderName": "UI",
      "parentFolderPathFromRoot": "UI",
      "fileId": "drive_file_abc123",
      "fileName": "button-spin.png",
      "filePathFromRoot": "UI/button-spin.png",
      "mimeType": "image/png",
      "createdTime": "2026-06-16T03:09:58.000Z",
      "modifiedTime": "2026-06-16T03:09:58.000Z",
      "size": 182304,
      "webViewLink": "https://drive.google.com/file/d/drive_file_abc123/view"
    },
    {
      "eventId": "evt_20260616_000127",
      "sequence": 127,
      "occurredAt": "2026-06-16T03:10:41.000Z",
      "action": "updated",
      "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
      "rootFolderName": "9704-ArtAssets",
      "parentFolderId": "folder_ui_01",
      "parentFolderName": "UI",
      "parentFolderPathFromRoot": "UI",
      "fileId": "drive_file_def456",
      "fileName": "button-stop.png",
      "filePathFromRoot": "UI/button-stop.png",
      "mimeType": "image/png",
      "createdTime": "2026-06-15T11:00:00.000Z",
      "modifiedTime": "2026-06-16T03:10:20.000Z",
      "size": 194221,
      "webViewLink": "https://drive.google.com/file/d/drive_file_def456/view"
    },
    {
      "eventId": "evt_20260616_000128",
      "sequence": 128,
      "occurredAt": "2026-06-16T03:10:42.000Z",
      "action": "deleted",
      "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
      "rootFolderName": "9704-ArtAssets",
      "parentFolderId": "folder_audio_01",
      "parentFolderName": "SFX",
      "parentFolderPathFromRoot": "Audio/SFX",
      "fileId": "drive_file_xyz999",
      "fileName": "old-click.wav",
      "filePathFromRoot": "Audio/SFX/old-click.wav",
      "mimeType": "audio/wav",
      "createdTime": "2026-06-10T08:00:00.000Z",
      "modifiedTime": "2026-06-15T13:05:00.000Z",
      "size": 502112,
      "webViewLink": "https://drive.google.com/file/d/drive_file_xyz999/view"
    }
  ]
}
```

---

## 3. Get Sync Plan

`GET /api/drive/sync-plan?rootFolderId=<id>&scope=today`

Endpoint này dùng cho UI `Drive Sync` trong Electron khi user chọn một Drive source và bấm sync.

Mục đích:

1. Check app có quyền truy cập root folder đó hay không
2. Mặc định chỉ trả file có `createdTime` hoặc `modifiedTime` rơi vào hôm nay
3. Trả về tổng số file để estimate progress
4. Trả về tổng dung lượng file để estimate progress theo bytes
5. Trả luôn normalized file list để app sync đúng path local

### Backend filter expectation

`sync-plan` dành cho asset sync trong Electron, nên `items` chỉ nên chứa file có thể download trực tiếp ở dạng binary.

Server nên exclude các file Google Workspace nội bộ, ví dụ:

- `application/vnd.google-apps.spreadsheet`
- `application/vnd.google-apps.document`
- `application/vnd.google-apps.presentation`
- `application/vnd.google-apps.folder`
- các mime type bắt đầu bằng `application/vnd.google-apps.`

Lý do:

- Electron app hiện sync theo flow `plan -> download file binary`
- các file Google Workspace không phù hợp với endpoint download asset thông thường
- nếu backend vẫn đưa các item này vào `items`, app sẽ phải skip hoặc báo lỗi dù thực tế folder asset không có vấn đề

Khuyến nghị:

- với folder sound, chỉ trả các file như `audio/mpeg`, `audio/wav`, `audio/ogg`
- với folder art/spine, chỉ trả các file như `image/png`, `application/json`, `text/plain`, `application/octet-stream`
- `totalFiles` và `totalBytes` phải được tính sau khi đã apply filter này, để progress trong app khớp với số file thật sự tải được

### Request

```http
GET /api/drive/sync-plan?rootFolderId=19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT&scope=today
Authorization: Bearer <INTERNAL_API_KEY>
```

### Query params

- `rootFolderId`
  Watched Drive root mà user chọn
- `scope`
  - `today` mặc định, chỉ lấy file thay đổi trong ngày
  - `all` nếu muốn full sync toàn bộ folder

### Hanh vi khuyen nghi cho Electron

- Nut `Sync` thuong goi `GET /api/drive/sync-plan?rootFolderId=<id>`
- Nut `Full Sync` co the goi `GET /api/drive/full-sync-plan?rootFolderId=<id>`
- Neu muon giu mot endpoint duy nhat, app van co the goi `GET /api/drive/sync-plan?rootFolderId=<id>&scope=all`

### Success response

```json
{
  "ok": true,
  "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
  "rootFolderName": "9704-ArtAssets",
  "scope": "today",
  "dateKey": "2026-06-16",
  "timeZone": "Asia/Ho_Chi_Minh",
  "totalScannedFiles": 490,
  "totalFiles": 18,
  "totalBytes": 28301924,
  "items": [
    {
      "fileId": "drive_file_abc123",
      "fileName": "button-spin.png",
      "filePathFromRoot": "UI/button-spin.png",
      "parentFolderPathFromRoot": "UI",
      "mimeType": "image/png",
      "size": 182304,
      "modifiedTime": "2026-06-16T03:09:58.000Z",
      "createdTime": "2026-06-16T03:09:58.000Z",
      "webViewLink": "https://drive.google.com/file/d/drive_file_abc123/view"
    }
  ]
}
```

### Error response

Missing root folder id:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_ROOT_FOLDER_ID",
    "message": "Missing rootFolderId."
  }
}
```

No access or folder not shared:

```json
{
  "ok": false,
  "error": {
    "code": "DRIVE_ACCESS_DENIED",
    "message": "The app does not have permission to access this Drive folder."
  }
}
```

Folder not found:

```json
{
  "ok": false,
  "error": {
    "code": "DRIVE_NOT_FOUND",
    "message": "Google Drive folder was not found."
  }
}
```

---

## 4. Get Full Sync Plan

`GET /api/drive/full-sync-plan?rootFolderId=<id>`

Endpoint nay la shortcut ro rang cho full sync. Backend se bo qua filter `today` va tra ve toan bo file trong root folder duoc chon.

### Request

```http
GET /api/drive/full-sync-plan?rootFolderId=19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT
Authorization: Bearer <INTERNAL_API_KEY>
```

### Success response

```json
{
  "ok": true,
  "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
  "rootFolderName": "9704-ArtAssets",
  "scope": "all",
  "dateKey": null,
  "timeZone": "Asia/Ho_Chi_Minh",
  "totalScannedFiles": 490,
  "totalFiles": 490,
  "totalBytes": 66158592,
  "items": [
    {
      "fileId": "drive_file_abc123",
      "fileName": "button-spin.png",
      "filePathFromRoot": "UI/button-spin.png",
      "parentFolderPathFromRoot": "UI",
      "mimeType": "image/png",
      "size": 182304,
      "modifiedTime": "2026-06-16T03:09:58.000Z",
      "createdTime": "2026-06-16T03:09:58.000Z",
      "webViewLink": "https://drive.google.com/file/d/drive_file_abc123/view"
    }
  ]
}
```

### Error response

Format loi giong `GET /api/drive/sync-plan`.

---

## 5. Download File

`GET /api/drive/files/:fileId/download`

Endpoint này stream file binary từ Google Drive qua bot server.

### Request

```http
GET /api/drive/files/drive_file_abc123/download
Authorization: Bearer <INTERNAL_API_KEY>
```

### Success response

Response là binary stream.

Headers gợi ý:

```http
Content-Type: image/png
Content-Disposition: attachment; filename="button-spin.png"
```

---

## 6. Get Tree Snapshot

`GET /api/drive/tree?rootFolderId=<id>`

Dùng để bootstrap local cache lần đầu hoặc rebuild nếu mất cursor.

### Response

```json
{
  "ok": true,
  "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
  "rootFolderName": "9704-ArtAssets",
  "generatedAt": "2026-06-16T03:15:00.000Z",
  "items": [
    {
      "type": "folder",
      "folderId": "folder_ui_01",
      "folderName": "UI",
      "pathFromRoot": "UI"
    },
    {
      "type": "file",
      "fileId": "drive_file_abc123",
      "fileName": "button-spin.png",
      "pathFromRoot": "UI/button-spin.png",
      "mimeType": "image/png",
      "modifiedTime": "2026-06-16T03:09:58.000Z",
      "size": 182304
    }
  ]
}
```

Nếu không truyền `rootFolderId`, server trả:

```json
{
  "ok": true,
  "items": [
    {
      "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
      "rootFolderName": "9704-ArtAssets",
      "generatedAt": "2026-06-16T03:15:00.000Z",
      "items": []
    }
  ]
}
```

---

## 7. Get Sync Status

`GET /api/drive/sync-status`

Dùng để Electron biết backend đang healthy không trước khi bấm sync.

### Response

```json
{
  "ok": true,
  "driveReady": true,
  "isCheckingDrive": false,
  "lastSuccessfulCheckTime": "2026-06-16T03:10:40.000Z",
  "watchedFolderCount": 6,
  "changeEventCount": 1284
}
```

---

## 7. Suggested Electron Flow

1. Call `GET /api/drive/watch-folders`
2. User chọn `Drive Source`
3. User chọn local root folder trên máy
4. App call `GET /api/drive/sync-plan?rootFolderId=...`
5. Nếu lỗi quyền/access thì show error và stop
6. Nếu ok:
   - dùng `totalFiles` hoặc `totalBytes` để estimate progress
   - loop qua `items`
   - download từng file qua `GET /api/drive/files/:fileId/download`
7. Sau full sync lần đầu, app có thể dùng `GET /api/drive/changes?cursor=...` cho incremental sync

### Lưu ý

- Hiện tại `sync-plan` mặc định là `scope=today`
- Nếu app của bạn cần full sync thủ công, hãy gọi:

```http
GET /api/drive/sync-plan?rootFolderId=<id>&scope=all
```

---

## 8. Report Sync Complete

`POST /api/drive/sync-complete`

Endpoint nay de app Electron bao nguoc lai cho web service sau khi da sync xong 100%. Server se dung Drive bot gui thong bao vao channel Discord.

Chi bao khi thanh cong. Neu sync fail thi app khong can goi endpoint nay.

### Request

```http
POST /api/drive/sync-complete
Authorization: Bearer <INTERNAL_API_KEY>
Content-Type: application/json
```

```json
{
  "syncType": "today",
  "rootFolderId": "19Zph0Ov8FucR1kSY6Ntwk_KCr_bFVXZT",
  "rootFolderName": "9704-ArtAssets",
  "localPath": "/Users/fe-tienhuynh/Documents/assets/9704-ArtAssets",
  "totalFiles": 18,
  "totalBytes": 28301924,
  "actorName": "Tien Huynh",
  "success": true
}
```

### Payload fields

- `syncType`
  - `today` cho sync trong ngay
  - `full` cho full sync
- `rootFolderId`
  Bat buoc
- `rootFolderName`
  Khuyen nghi gui kem de message dep hon
- `localPath`
  Bat buoc, la path local da sync thanh cong
- `totalFiles`
  Optional
- `totalBytes`
  Optional
- `actorName`
  Optional, de in ra ai da sync
- `success`
  Optional. Neu gui `false`, backend se bo qua va khong bao Discord

### Success response

```json
{
  "ok": true,
  "notified": true,
  "syncType": "today"
}
```

### Ignored response

Neu app van goi nham cho case fail:

```json
{
  "ok": true,
  "skipped": true,
  "reason": "FAILED_SYNC_IGNORED"
}
```

### Discord message example

```text
Tổng tài đã sync thành công [9704-ArtAssets] tại path `/Users/fe-tienhuynh/Documents/assets/9704-ArtAssets` (18 file, 28301924 bytes).
```
