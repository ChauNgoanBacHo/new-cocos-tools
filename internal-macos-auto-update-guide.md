# Checklist Auto-Update Cho App Electron Nội Bộ Trên macOS

## 1. Mục tiêu và giới hạn

- Không cần Apple Developer ID hoặc notarization để triển khai cơ chế cập nhật riêng này.
- Không dùng Squirrel.Mac để thay app; dùng helper chạy sau khi app thoát.
- Vẫn có chữ ký bảo mật: Ed25519 do mình quản lý để xác thực release, không phải chữ ký Apple.
- Giữ nguyên Gatekeeper, không tắt SIP, không tự xóa quarantine và không yêu cầu quyền admin.
- App cần được cài trong thư mục user có quyền ghi. Có thể dùng `~/Applications` khi `/Applications` không cho ghi.
- Đây là hướng dẫn cho Electron trên macOS, không phải updater dùng chung ngay cho Windows/Linux.
- Vẫn tải ZIP đầy đủ dưới nền. Lợi ích là không phải tải, giải nén và thay app bằng tay; không phải delta update.
- Các chính sách bảo mật hoặc quản trị máy của công ty vẫn có thể chặn chạy app. Cơ chế này không thay thế notarization hoặc vượt qua chính sách đó.

## 2. Kiến trúc

```text
Máy release
  build app -> ZIP -> SHA-256 + kích thước -> manifest
  -> ký manifest bằng private key Ed25519
  -> upload GitHub draft -> publish khi đủ artifact

App đang cài
  kiểm tra GitHub Release -> so sánh version
  -> kiểm tra chữ ký manifest bằng public key đã nhúng
  -> kiểm tra appId + arch + tên artifact
  -> tải ZIP -> kiểm tra kích thước + SHA-256
  -> user bấm Restart & Install
  -> xác thực lại -> giải nén vào staging -> kiểm tra bundle
  -> helper đợi app thoát -> backup app cũ -> thay app mới -> mở lại
```

Không dùng checksum tải cùng ZIP làm bằng chứng duy nhất về nguồn phát hành. Manifest cần chữ ký xác thực bằng key được app tin cậy từ trước.

## 3. Khai báo riêng cho mỗi app

Trước khi copy code, xác định các giá trị sau và dùng nhất quán trong runtime, verifier, release script và test:

| Giá trị | Ví dụ trong One Punch DevKit |
| --- | --- |
| GitHub repository | `ChauNgoanBacHo/new-cocos-tools` |
| App/bundle ID | `com.superapp.app` |
| Product name | `One Punch DevKit` |
| Bundle name | `One Punch DevKit.app` |
| Executable name | `One Punch DevKit` |
| ZIP prefix | `One-Punch-DevKit` |
| ZIP name | `One-Punch-DevKit-0.5.12-arm64-mac.zip` |
| Manifest name | `update-mac-arm64.json` |
| Public key | `assets/update-public.pem` |
| Private key trên máy build | `~/.config/one-punch-devkit/update-private.pem` |
| Staging prefix | `.one-punch-update-` |
| Install result log | `app.getPath('userData')/update-result.txt` |

- [ ] App có `appId` riêng, ổn định qua các bản.
- [ ] Repo release public để client không cần GitHub token. Repo chứa source có thể vẫn private nếu dùng một repo public riêng chỉ chứa release.
- [ ] Dùng cặp key riêng cho mỗi app để giới hạn ảnh hưởng nếu một private key bị lộ.
- [ ] Không chỉ đổi tên class/UI rồi giữ nguyên ID, key và artifact của app mẫu.
- [ ] Nếu tạo config chung, cấu hình appId/repo/key phải nằm trong app được cài, không lấy lại từ manifest chưa tin cậy.

## 4. Những phần cần implement

### A. Tạo và giữ key

- [ ] Tạo Ed25519 key pair một lần cho mỗi app.
- [ ] Ghi private key ngoài repo, quyền file `600`; không đóng vào app hoặc upload release.
- [ ] Commit public key và nhúng nó vào package của client.
- [ ] Backup private key an toàn; máy build khác phải dùng cùng key.
- [ ] Cho phép chọn private key qua `UPDATE_SIGNING_KEY_PATH`.
- [ ] Không tự tạo key mới mỗi lần build; không tự thay public key khi mất private key.
- [ ] Có kế hoạch khôi phục/đổi key. Client hiện tại chỉ tin một public key; đổi key chưa có transition sẽ cần cài tay lại.

### B. Build và ký release

- [ ] Tăng version và đồng bộ lockfile trước khi publish.
- [ ] Build app và ZIP đúng kiến trúc; không sửa ZIP sau khi đã ký manifest.
- [ ] Manifest chứa `schema`, `appId`, `version`, `arch`, `file`, `size`, `sha256`.
- [ ] Ký chính xác bytes payload; lưu envelope gồm payload base64 và signature base64.
- [ ] Kiểm tra private key khớp public key nhúng trong app trước khi build/publish.
- [ ] Chạy thử verifier trên manifest vừa ký.
- [ ] Publish qua GitHub API: tạo draft, upload đủ ZIP và signed manifest, sau đó mới công bố.
- [ ] Không overwrite version đã phát hành. Lỗi release phải tăng version mới.
- [ ] GitHub Actions dùng `GITHUB_TOKEN` tự cấp với `permissions: contents: write`, không cần PAT. Chỉ khi publish local mới cần token đăng nhập có quyền upload; không nhúng token vào client.

`latest-mac.yml` và blockmap có thể vẫn do electron-builder sinh ra, nhưng updater riêng này dùng signed JSON + ZIP, không phụ thuộc chúng để cài.

### C. Main process: kiểm tra và tải

- [ ] Chỉ bật updater cho packaged macOS build.
- [ ] Kiểm tra release khi mở app; có nút check thủ công.
- [ ] Chỉ nhận version cao hơn. Code mẫu hiện chỉ hỗ trợ stable `x.y.z`, chưa hỗ trợ prerelease.
- [ ] Xác thực chữ ký trước khi tin thông tin manifest hoặc tải artifact.
- [ ] Kiểm tra appId, version, architecture, tên file, giới hạn kích thước và SHA-256.
- [ ] Có timeout, progress, báo lỗi; chặn check/download/install trùng nhau.
- [ ] Tải vào cache riêng, kiểm tra kích thước và hash sau khi tải; xóa bản tải lỗi.
- [ ] Download bị gián đoạn không được coi là update sẵn sàng.

### D. Chuẩn bị cài và helper

- [ ] Chỉ cài sau thao tác xác nhận của user; không tự đóng app đang làm việc.
- [ ] Xác thực lại chữ ký và checksum ngay trước khi chuẩn bị cài.
- [ ] Chặn chạy update từ DMG/read-only volume hoặc App Translocation.
- [ ] Kiểm tra quyền ghi trước khi thoát; không tự nâng quyền.
- [ ] Kiểm tra đường dẫn ZIP, chặn absolute path và `..` trước khi giải nén.
- [ ] Giải nén vào thư mục staging riêng, quyền `700`, nằm cạnh app để cùng filesystem.
- [ ] Kiểm tra bundle ID, version, bundle/executable name và executable tồn tại, có quyền chạy.
- [ ] Copy helper ra ngoài bundle đang chạy; truyền các đường dẫn bằng argument, không nối thành shell command.
- [ ] Helper đợi PID app cũ thoát, có thời gian chờ giới hạn.
- [ ] Move app cũ vào backup trước; không xóa app cũ ngay.
- [ ] Move app mới vào đúng đường dẫn cài cũ, rồi gọi macOS mở lại.
- [ ] Khôi phục backup nếu thay file hoặc yêu cầu mở app thất bại ngay.
- [ ] Ghi kết quả ra log để xử lý nếu helper lỗi sau khi UI đã đóng.
- [ ] Giữ nguyên userData/config, không xóa dữ liệu người dùng trong quá trình cập nhật.

### E. Preload và UI

- [ ] Expose API tối thiểu: `getState`, `check`, `install`, `onState`.
- [ ] Renderer không tự thao tác filesystem hoặc chạy installer.
- [ ] Đồng bộ handler, preload và TypeScript types.
- [ ] Settings hiện current version, trạng thái, progress và lỗi.
- [ ] Nút Restart & Install chỉ hiện khi đã xác thực xong.
- [ ] Unsubscribe event khi unmount; bắt lỗi IPC và disable các thao tác đang bận.
- [ ] Không hiện thông báo "update thành công" chỉ vì mở Settings; xác nhận bằng version/binary mới sau restart.

## 5. File tham khảo trong repo này

| File | Vai trò |
| --- | --- |
| `electron/handlers/appUpdater.ts` | Check GitHub, download, verify và chuẩn bị cài |
| `electron/main.ts` | Đăng ký IPC và khởi tạo updater |
| `electron/preload.ts` | Bridge API và event |
| `src/types/electron.d.ts` | Contract renderer |
| `src/components/AppUpdateSettings.tsx` | UI Settings |
| `src/components/SettingsPanel.tsx` | Gắn UI updater |
| `scripts/update-security.mjs` | Verifier, version comparison, SHA-256 |
| `scripts/update-security.d.mts` | Types cho module security |
| `scripts/create-update-key.mjs` | Tạo key pair |
| `scripts/release-mac.mjs` | Build, ký manifest và publish draft |
| `scripts/prepare-ci-update-key.mjs` | Khôi phục Actions secret, kiểm tra key khớp public key |
| `.github/workflows/release-mac.yml` | Build/publish macOS arm64 bằng GitHub Actions |
| `scripts/update-security.test.mjs` | Tests verifier và helper |
| `assets/install-update.sh` | Helper thay bundle và backup |
| `assets/update-public.pem` | Public key của riêng app này |
| `package.json` | Version, npm scripts, artifactName, extraResources |

Khi mang sang app mới, đọc và sửa các constant theo mục 3. Không copy public/private key của One Punch DevKit sang app mới.

## 6. Cấu hình và lệnh mẫu

Đảm bảo electron-builder đóng `assets/update-public.pem` và `assets/install-update.sh` qua `extraResources`, cùng với main/preload/renderer đã build.

```json
{
  "scripts": {
    "update:keygen": "node scripts/create-update-key.mjs",
    "test:updater": "node --test scripts/update-security.test.mjs",
    "release:mac": "node scripts/release-mac.mjs",
    "release:mac:publish": "node scripts/release-mac.mjs --publish"
  }
}
```

Lần đầu, sau khi sửa config/key path cho app mới:

```bash
npm run update:keygen
npm run test:updater
npm run release:mac
```

### Phát hành bằng GitHub Actions, không cần PAT

Thêm repository Actions secret `UPDATE_SIGNING_PRIVATE_KEY` chứa nội dung PEM của private key đã tạo cho app đó. Không tạo key mới nếu đã có client được cài. Có thể dùng GitHub Settings hoặc `gh secret set` khi CLI đã đăng nhập.

Workflow cần:

- Chỉ dùng `workflow_dispatch` để bấm chạy thủ công; không trigger tự động khi push commit hoặc tag.
- macOS runner đúng architecture. Workflow mẫu dùng `macos-15` và kiểm tra `process.arch === 'arm64'`.
- Quyền `contents: write` để tạo/upload release bằng `${{ secrets.GITHUB_TOKEN }}`.
- `npm ci`, test, khôi phục key vào `runner.temp` với mode `600`, sau đó build/ký/publish.
- Kiểm tra tag khớp version/lockfile và private key khớp public key đã nhúng.
- Cleanup private key với `if: always()`; không upload thư mục chứa key vào artifacts.
- Không chạy workflow có signing secret trên code pull request từ nguồn không tin cậy.

Sau khi sửa version và push commit lên `main`, bấm **Actions -> Release macOS -> Run workflow**. Push commit hoặc tag không tự chạy workflow. Workflow tạo release draft, upload đủ file rồi mới công bố. Không cần tự tạo hoặc export Fine-grained PAT.

### Phát hành local, tùy chọn

Mỗi lần phát hành local:

```bash
# Chỉ tăng version khi quyết định phát hành; ví dụ thay bằng version của app đó.
npm version 1.0.1 --no-git-tag-version

# Review, commit và push đúng thay đổi của release trước khi publish.
export GH_TOKEN='github_pat_xxx'
npm run release:mac:publish
```

Không commit token hoặc private key. `export` chỉ tồn tại trong shell session hiện tại. Đường local không bắt buộc nếu đã dùng Actions.

## 7. Checklist test trước khi chia sẻ cho team

- [ ] Manifest hợp lệ được chấp nhận; signature sai, payload bị sửa hoặc key khác bị từ chối.
- [ ] Sai appId, architecture, tên file, size và checksum bị chặn.
- [ ] Version bằng/cũ hơn không cài; so sánh version theo số, không theo chuỗi.
- [ ] Lỗi mạng, GitHub rate limit, thiếu manifest và tải gián đoạn hiển thị lỗi rõ ràng.
- [ ] Bundle sai ID/version hoặc ZIP có path nguy hiểm không được cài.
- [ ] Không có quyền ghi hoặc đang chạy từ DMG thì báo lỗi trước khi đóng app.
- [ ] Helper xử lý được đường dẫn có khoảng trắng và chờ app cũ thoát.
- [ ] Test thay app trên bản sao trong thư mục tạm; kiểm tra backup và nhánh khôi phục.
- [ ] Mở packaged app thật, xác nhận renderer và IPC hoạt động; build pass chưa đủ.
- [ ] Kiểm tra ZIP cuối cùng: có public key/helper, không có private key hoặc token.
- [ ] Test end-to-end bằng hai release: cài A, publish B cao hơn bằng cùng key, check/download/install, mở lại đúng B.
- [ ] Xác nhận userData và các đường dẫn/settings cũ vẫn còn.
- [ ] Chỉ publish khi có signed manifest khớp chính xác ZIP phát hành.

## 8. Chuyển từ updater cũ và các phần mở rộng

App đang dùng Squirrel với ad-hoc signature cần cài tay một bản chuyển tiếp có helper mới. Sau đó các bản cao hơn mới dùng cơ chế này. Không thể sửa client cũ chỉ bằng việc thay metadata trên server.

Các phần CHƯA có trong implementation mẫu, cần làm thêm nếu app khác cần:

- Resume download hoặc delta update.
- Tự dọn cache/backup theo số bản giữ lại; hiện giữ backup để khôi phục thủ công.
- Health-check sau launch và tự rollback khi app mới crash. Hiện helper chỉ biết yêu cầu `open` có trả lỗi ngay hay không.
- Publish arm64 và x64 vào cùng một release một cách phối hợp. Script hiện build theo kiến trúc máy và chặn sửa release đã public; không chạy publish độc lập hai lần cho cùng version.
- Private release server, xác thực từng user hoặc GitHub repo private cho client.
- Prerelease channels và key rotation có transition nhiều public key.
- Updater cho Windows/Linux với helper, permissions và test riêng từng nền tảng.

## 9. Tiêu chí hoàn tất

User cài bản chuyển tiếp một lần. Từ lần sau, mở app, thấy update mới, tải nền, bấm Restart & Install và app mở lại đúng version mới; không kéo `.app` bằng tay, không cần Apple Developer certificate và không bỏ kiểm tra tính xác thực của bản update.
