# Matrix Simulator Sync Plan

## Objective

Tận dụng Node.js server hiện có để làm nơi lưu trữ tập trung cho dữ liệu `Matrix Simulator`, giúp các máy nội bộ có thể:

- publish matrix local lên server
- fetch matrix từ server về Electron app
- import vào local app để dùng tiếp
- đồng bộ dần dữ liệu matrix giữa nhiều máy riêng lẻ

Phạm vi của tài liệu này chỉ tập trung vào phần `matrix detail` data. `Common Data` hiện tại không nằm trong scope đồng bộ API v1.

---

## Product Goals

1. Tạo một nguồn dữ liệu chung cho các cấu hình matrix simulation.
2. Giảm tình trạng mỗi máy giữ một bộ matrix riêng, khó chia sẻ.
3. Cho phép internal user publish nhanh từ Electron app lên server.
4. Cho phép internal user fetch/import nhanh từ server về máy local.
5. Giữ cấu trúc data đủ linh hoạt để hỗ trợ các game khác nhau mà không phải sửa backend mỗi lần thêm field phụ.

---

## Scope V1

### In Scope

- API lưu danh sách matrix templates trên Node.js server
- Tài liệu chuẩn hóa payload của `matrix detail`
- Electron app có nút:
  - `Fetch from API`
  - `Import to Local`
  - `Publish Local to API`
- Hỗ trợ dữ liệu field bắt buộc và field flexible
- Hỗ trợ versioning tối thiểu để tránh đè nhầm dữ liệu

### Out of Scope

- Auth phức tạp kiểu user account / role / OAuth
- Realtime sync 2 chiều bằng WebSocket
- Merge conflict tự động nâng cao
- Sync `Common Data`
- Public sharing ngoài hệ thống nội bộ

---

## Current App Boundary

Hiện tại `Matrix Simulator` có 2 lớp dữ liệu:

1. `Common Data`
2. `Matrix Detail`

Trong hướng sync mới:

- chỉ sync `Matrix Detail`
- không sync `gameId`, `gameName`, `userId`, `env`
- mỗi record trên server là một template matrix detail có thể import vào game local bất kỳ

Điều này giúp dữ liệu reusable hơn và tránh bị khóa cứng theo từng game local.

---

## Data Direction

### Local to Remote

Electron app chọn một hoặc nhiều matrix detail local, sau đó:

1. chuẩn hóa payload
2. gửi lên Node.js API
3. server lưu lại thành template hoặc version mới

### Remote to Local

Electron app gọi API để:

1. lấy danh sách matrix templates
2. xem preview metadata
3. chọn template cần dùng
4. import vào game local hiện tại

---

## UX Plan In Electron

### Matrix Simulator List / Detail

Thêm một action group mới trong page `Matrix Simulator`, ưu tiên đặt ở khu vực detail vì user sẽ thao tác theo từng matrix:

- `Fetch from API`
- `Publish to API`
- `Import Selected`

### Suggested Flow

#### Publish

1. User mở game local
2. Chọn matrix detail cần publish
3. Bấm `Publish to API`
4. App gửi payload matrix detail lên server
5. Server trả về `templateId`, `version`, `updatedAt`
6. App hiện trạng thái publish thành công

#### Fetch / Import

1. User bấm `Fetch from API`
2. App load danh sách matrix templates từ server
3. User chọn template
4. App cho preview field data
5. User bấm `Import to Local`
6. App tạo panel mới local hoặc overwrite panel đang chọn

---

## Recommended Server Data Model

### Core Entity

`matrix_template`

Thông tin nên có:

- `id`
- `slug`
- `title`
- `matrixData`
- `tableFormat`
- `additionalData`
- `tags`
- `notes`
- `source`
- `version`
- `createdAt`
- `updatedAt`
- `createdBy`
- `updatedBy`

### Why Split `additionalData`

Các field phụ hiện tại thay đổi theo game và có thể còn tăng thêm về sau. Nếu server hardcode toàn bộ schema thành cột cố định quá sớm sẽ khó maintain.

V1 nên dùng:

- field cố định cho các trường chính
- object `additionalData` cho phần flexible

Sau khi dùng ổn một thời gian mới quyết định field nào cần promote lên first-class column.

---

## Technical Plan

## Phase 1: Documentation First

Mục tiêu:

- chốt payload chuẩn cho matrix detail
- phân loại required fields và flexible fields
- chốt contract fetch / publish / import

Deliverables:

- `matrix-simulator-sync-plan.md`
- `matrix-simulator-sync-api.md`

## Phase 2: Node.js API Foundation

Mục tiêu:

- tạo table / collection lưu `matrix templates`
- expose endpoint list / detail / publish / update

Deliverables:

- storage schema
- REST endpoints
- validation cơ bản

## Phase 3: Electron Read Flow

Mục tiêu:

- Electron app fetch được danh sách templates từ API
- render list để user chọn
- import một template vào local app

Deliverables:

- service layer gọi API
- UI list modal / panel
- mapping remote payload -> local `PanelData`

## Phase 4: Electron Publish Flow

Mục tiêu:

- publish một matrix detail local lên API
- update template cũ hoặc tạo template mới

Deliverables:

- nút publish
- confirm popup trước khi overwrite
- success/error state rõ ràng

## Phase 5: Optional Sync Improvements

Mục tiêu:

- tìm duplicate
- hỗ trợ search / tags
- diff giữa local và remote
- version history

---

## Mapping Strategy

### Remote Template -> Local Panel

Server record map về local panel như sau:

- `title` -> `panel.title`
- `matrixData` -> `panel.matrixData`
- `tableFormat` -> `panel.tableFormat`
- `additionalData.*` -> các field optional tương ứng trong panel

Local-only UI state không nên sync:

- `id`
- `isExpanded`
- `isAdditionalExpanded`

Các field UI state này phải được Electron tạo lại khi import.

---

## Conflict Strategy

V1 khuyến nghị dùng cách đơn giản:

- publish mặc định tạo bản mới hoặc overwrite có xác nhận
- update phải gửi kèm `version`
- nếu `version` không khớp thì trả về `409 CONFLICT`

Electron lúc đó có thể:

- báo cho user biết remote đã thay đổi
- cho phép fetch lại trước khi publish tiếp

---

## Validation Rules

Server nên validate tối thiểu:

- `matrixData` không được rỗng
- `tableFormat` không được rỗng
- `tableFormat` phải parse được thành danh sách số dương
- `title` có thể rỗng nhưng nên trim
- `additionalData` phải là object nếu có
- không cho field unknown xuất hiện ở root payload, nhưng cho phép field unknown nằm trong `additionalData`

---

## Recommended Next Implementation Order

1. Chốt API contract
2. Tạo storage schema ở Node.js server
3. Tạo `GET /matrix-templates`
4. Tạo `POST /matrix-templates`
5. Tạo Electron fetch/import flow
6. Tạo Electron publish flow
7. Thêm search, tags, version history nếu cần

---

## Open Questions

1. Một template có nên gắn `gameId` tham chiếu không, hay để hoàn toàn generic?
2. Publish mặc định là `create new` hay `overwrite existing`?
3. Có cần thêm `tags`, `notes`, `author` ngay từ v1 không?
4. Có cần import nhiều matrix cùng lúc vào local game không?
5. Có cần một cờ `isShared` / `isPrivate` cho template nội bộ không?

---

## Suggested V1 Decision

Để đi nhanh và an toàn:

- template nên generic, không khóa theo `gameId`
- publish mặc định là `create new`
- overwrite chỉ dùng khi có `templateId`
- hỗ trợ `tags` và `notes` ngay từ đầu nếu backend làm nhanh được
- import nên hỗ trợ cả single item và multi-select ở bước sau
