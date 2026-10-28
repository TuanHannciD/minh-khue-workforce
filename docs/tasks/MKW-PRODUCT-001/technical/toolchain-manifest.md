# Toolchain manifest — pins G1 và kiểm chứng Task2–3

## Hiện hành Task4 — consumer form nhân sự

Web đã cài exact React Hook Form7.91.0, @hookform/resolvers6.0.2 và Zod4.6.7 theo pins G1, consumer thật `features/employees/ui/employee-form.tsx`. pnpm thêm release-age exception chỉ resolver6.0.2; giữ engine/required peers/build policy strict. Frozen install exit0, product lint/format/types/build/tooling/boundary/drift và web31/API6 đạt; pilot22 check10/E2E2 đạt. Không cài primitives shadcn/Radix/Tailwind hoặc Excel trước consumer task tương ứng; form giữ native controls và tokens C đã có.

Schema Prisma7.10.1 + migration002 Employee/AttendanceCell đã kiểm PostgreSQL17.11 mới từ trống và upgrade auth giữ hai account/session. Evidence Task4 tại `.agent-runs/MKW-PRODUCT-001/task4-employees/`; main còn phải independent employees/migration review exact tip. Không claim AC15/full attendance race hoặc Linux/device/TLS/operator/reader đã đạt. Các phần Task2–3 bên dưới là checkpoint theo phạm vi tương ứng.

## Hiện hành Task3 — consumers auth/session

Đã cài đúng pins được duyệt cho Prisma client/adapter/CLI7.10.1, pg8.23.1, Argon2 0.45.1, throttler6.7.1, class-validator/transformer, cookie-parser/Helmet; web Query/Router và Testing Library/jsdom theo package/lock exact. Không cài phần UI primitives/forms/Excel chưa có consumer. Prisma CLI Studio required peers React/DOM19.3.1 là API devDependencies, không mở Studio; engine/peer/native strict giữ nguyên. pnpm thêm minimumReleaseAgeExclude đúng hai pins react-router/react-router-dom7.18.5 theo yêu cầu consumer đã duyệt, không bỏ release-age toàn registry.

Windows Node24.22.1/native Argon2 và Prisma generate/build/migration/readback PostgreSQL17.11 đã chạy thật. Prisma generated ESM có type-only cycles nội bộ: graph checker miễn đúng cycle đó trong generated path, fixture vẫn chặn runtime/manual cycles và xuyên app. Linux native Not run vì Docker daemon không sẵn; portability config không thay evidence runtime. Evidence và rulings tại `.agent-runs/MKW-PRODUCT-001/task3-auth/` và report Task3 ignored. Các mục Task2/chưa cài bên dưới là checkpoint lịch sử; independent auth/schema review Task3 do main thực hiện, chưa PASS.

Ngày28/10/2026. Bộ pin Task1 đã qua independent G1 reviewR2 tại95ce21a; quyền hiện hành cho phép Task2 cài/kiểm mà không chờ confirmation thường lệ. Dùng stack ADR-003, không install latest. Bảng toàn bộ stack bên dưới vẫn gồm dependency tương lai chưa có consumer; không được hiểu là tất cả đã cài. Independent review **code Task2 còn Pending**, do main điều phối.

## Hiện hành Task2

- Đã cài thực trong pnpm workspace: root tooling cũ giữ nguyên version; thêm TypeScript5.9.3/types Node24.19.2, dependency-cruiser18.7.0, typescript-eslint8.72.1, react-hooks7.1.1, Prettier3.9.10, openapi-typescript7.13.0. Web dùng React/DOM19.3.1, types19.3.0, Vite8.3.5/plugin-react6.1.2/Vitest5.0.5. API dùng Nest common/core/platform-express12.3.2, Swagger12.0.5, Express5.3.0/types5.0.6, reflect-metadata0.2.2/rxjs7.8.2. Không cần Nest CLI cho compiler bootstrap này.
- Chưa cài vào product: Prisma/DB/auth/forms/router/query/UI/Excel/Testing Library và các dependency chưa có consumer Task2. Prisma7 compatibility spike dùng package/lock/store **sandbox ignored riêng**, không biến thành dependency sản phẩm. Không scaffold feature rỗng.
- Portable Node24.22.1 win-x64 từ `https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip`, SHA256 **d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5**, đối chiếu đúng `SHASUMS256.txt` HTTPS upstream trước extract; executable báo v24.22.1. Pilot executable gốc `C:/nvm4w/nodejs/node.exe` vẫn v22.12.0.
- pnpm12 dùng native executable: package `pnpm@12.15.0` registry SHA512 `s5UdbW/0qfE9x89WzSjSuOs328ycaOUuHhGRhz6p+CoBcoerULqtxczElPA2xnwOR+sTYIwvo29HcRth6hKOYQ==`; native `@pnpm/exe.win32-x64@12.15.0` SHA512 `nrd+Tp1We1DGj4DGG5Bea9lZNh9y1PjlLBdEwdInS4D0h0UIDtM7JaGGGDJhNzIwcHASyihWI7HLV+dtG+fhYg==`. Hai tarball đối chiếu integrity registry trước extract; native báo12.15.0. Metadata/checksum/downloads tại `.agent-runs/MKW-PRODUCT-001/task2-toolchain/`; không đổi config/PATH global.
- Strict engine/required peers/install đạt với exact pins gốc, chưa cần sửa pin. Optional peers framework/compiler không có consumer không tự cài. `strictDepBuilds` bắt telemetry `@scarf/scarf1.4.0`; đọc `report.js` rồi deny riêng script này trong `allowBuilds`. Không tắt kiểm scripts/native. Vite build thực load native Rolldown binding thành công; `pnpm rebuild` exit0.
- API compile strict NodeNext/ESM/decorator metadata và chạy compiled HTTP thật. Alias API chọn native `#app/*` (package imports + tsconfig), web `@/` (Vite + tsconfig); tránh alias compile-only cần loader/rewrite. Swagger sinh3.0.3; openapi-typescript + formatter pin sinh deterministic snapshot/types, generated consumer compile đúng5.9.3.
- `pnpm run product:check` đạt bootstrap; frozen install thường và fresh node_modules offline từ project store đạt/lock hash giữ nguyên; audit snapshot0 advisory, license tree đã ghi (MIT/Apache/ISC/BSD/Python-2.0/CC-BY-4.0/CC0/BlueOak và dual MIT-or-CC0). Đây không là security/legal assurance toàn bộ sản phẩm. [Validation](../validation.md) và ignored task report giữ chi tiết lệnh/RED–GREEN/giới hạn.
- PostgreSQL17.11 portable EDB archive từ `https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip`,340719294 bytes, local SHA256 **6eabdf00d2893713b75db4336a23c3fdf505f056e217ec6e2e95d901750cfea3**; `postgres/pg_ctl --version` cùng17.11. EDB sidecar checksum trả403, executable unsigned: hash local là fingerprint retained artifact, **không** claim đã đối chiếu publisher checksum. Không có Docker/psql/pg_ctl sẵn; đã provision binary trong task-owned ignored path, không cài service.
- Acceptance spike3 đạt trong sandbox riêng: schema chỉ `ToolchainProbe`, Prisma client/CLI/adapter7.10.1 + pg8.23.1, native engine postinstall chạy thật, required peers strict đạt. Prisma CLI kéo Studio0.33.0 có peers React/DOM; metadata xác nhận và thêm đúng19.3.1 vào **devDependencies sandbox** để đáp ứng, không disable peer checks hoặc mở Studio. Generator `prisma-client` ESM/import `.js`, TypeScript5.9 strict NodeNext build, migration từ DB mới trống, Prisma write → client mới read + pg query độc lập, cùng process compiled Nest health200. Product schema/auth chưa được triển khai.
- Cluster mới `postgres/data-task2`, loopback127.0.0.1:56449, role `mkw_task2`, DB `mkw_task2_probe_v2`, data directory/version/user/database/port đối chiếu thật. HBA trust chỉ role thử trên loopback trong cluster này, không hệ thống hiện có. DB `mkw_task2_probe` giữ lỗi harness đầu (gộp stderr banner vào SQL); sửa bằng `migrate diff --output`, DB v2 mới, không reset DB. Cluster đã dừng bằng pg_ctl đúng owner, data/logs retained. `spike-runtime.log` PASS, không suy thành test schema/quyền/concurrency Task3–5.
- Pilot `npm run check`10/10 và `npm run test:e2e`2/2 desktop/mobile đạt dưới executable22.12.0 gốc sau khi cài lại Chromium project-local tại pnpm path. Tự review diff chuyển package manager, xác minh mọi direct pilot pin/script giữ nguyên; npm lock baseline SHA256 **fa935db0a6f4b35e138e9846e2ac279933ef322d9653d2d709fa6b075cb1438c** giữ nguyên đến sau frozen/product/pilot checks rồi sao lưu byte-for-byte dưới ignored evidence và bỏ active `package-lock.json`. `pnpm-lock.yaml` là lockfile active duy nhất; baseline còn trong Git base và evidence, independent review transition vẫn do main thực hiện trên final tip.

Các đoạn “chưa cài/Not run” trong phần quyết định ban đầu dưới đây là checkpoint Task1, được trạng thái Task2 ở trên và validation tiếp nối; không tự nâng acceptance nghiệp vụ/DB/touch/Excel.

## Runtime và đường chuyển

- Product: Node.js **24.22.1 LTS Krypton** (nguồn [release index](https://nodejs.org/dist/index.json), bản phát hành20/10/2026), pnpm **12.15.0**. Engines product `>=24.22.1 <25`, không lấy Node22.12 của pilot làm chuẩn sản phẩm. Không đổi Node global; dùng executable/runtime task-owned đã xác minh khi task2 được phép cài.
- PostgreSQL **17.11** (nguồn [versioning](https://www.postgresql.org/support/versioning/)); patch được pin cho sandbox. Không chọn image :latest; nếu dùng container phải ghi platform/digest lấy từ registry tại task2 trước chạy, không chế SHA trong docs. Docker/service availability hiện chưa kiểm, không tự cài service global. Release target/hạ tầng chưa chọn.
- Local hiện `node --version` là **v22.12.0**, phù hợp engine pilot `>=22.12 <23`; product runtime24 chưa cài/kiểm. Pilot tiếp tục chạy bằng runtime22.12.0 riêng trong command environment; không sửa env global hoặc nghiệp vụ SQLite pilot.
- Root scripts npm hiện có giữ tên/công dụng. Task2 thêm scripts product dùng pnpm, root engines đề xuất `>=22.12 <23 || >=24.22.1 <25`, product app engines chỉ24.22.1–24.x. Chạy pnpm install/build sản phẩm dưới24; chạy npm check/test:e2e pilot dưới22.12.0, PATH chỉ theo process/run. Không giả một runtime đáp ứng cả hai.
- Task2 chuyển root và hai app sang một pnpm workspace/lockfile, giữ nguyên version dependencies pilot. Trong lúc chuyển giữ package-lock.json làm baseline; chỉ bỏ lock npm active sau pnpm frozen install + product checks + pilot regression đạt và review diff. Git giữ lịch sử baseline để rollback; không để hai lockfile cùng là nguồn active. Không chạy npm ci làm mất pnpm links trong checkout đã chuyển; `npm run ...` vẫn là script runner, không package installer.

## Direct dependencies chính xác để tạo package.json ở task2–9

Mỗi link trỏ metadata đúng version. Bảng là manifest đề xuất, không file lock đã resolve toàn bộ transitive. Dependency chỉ cài khi task có consumer; không scaffold toàn bộ module. Optional peer của framework (Fastify, microservices, mọi resolver, canvas/coverage) không tự được cài chỉ vì có tên trong metadata; pnpm peer check phải xác minh required vs optional tại task2.

| Package | Exact version | License khai báo | Metadata source |
| --- | --- | --- | --- |
| `@eslint/js` | `9.39.5` | MIT | [registry](https://registry.npmjs.org/@eslint/js/9.39.5) |
| `@hookform/resolvers` | `6.0.2` | MIT | [registry](https://registry.npmjs.org/@hookform/resolvers/6.0.2) |
| `@nestjs/cli` | `12.0.11` | MIT | [registry](https://registry.npmjs.org/@nestjs/cli/12.0.11) |
| `@nestjs/common` | `12.3.2` | MIT | [registry](https://registry.npmjs.org/@nestjs/common/12.3.2) |
| `@nestjs/core` | `12.3.2` | MIT | [registry](https://registry.npmjs.org/@nestjs/core/12.3.2) |
| `@nestjs/platform-express` | `12.3.2` | MIT | [registry](https://registry.npmjs.org/@nestjs/platform-express/12.3.2) |
| `@nestjs/swagger` | `12.0.5` | MIT | [registry](https://registry.npmjs.org/@nestjs/swagger/12.0.5) |
| `@nestjs/testing` | `12.3.2` | MIT | [registry](https://registry.npmjs.org/@nestjs/testing/12.3.2) |
| `@nestjs/throttler` | `6.7.1` | MIT | [registry](https://registry.npmjs.org/@nestjs/throttler/6.7.1) |
| `@playwright/test` | `1.64.1` | Apache-2.0 | [registry](https://registry.npmjs.org/@playwright/test/1.64.1) |
| `@prisma/adapter-pg` | `7.10.1` | Apache-2.0 | [registry](https://registry.npmjs.org/@prisma/adapter-pg/7.10.1) |
| `@prisma/client` | `7.10.1` | Apache-2.0 | [registry](https://registry.npmjs.org/@prisma/client/7.10.1) |
| `@tailwindcss/vite` | `4.3.3` | MIT | [registry](https://registry.npmjs.org/@tailwindcss/vite/4.3.3) |
| `@tanstack/react-query` | `5.105.0` | MIT | [registry](https://registry.npmjs.org/@tanstack/react-query/5.105.0) |
| `@testing-library/dom` | `10.4.1` | MIT | [registry](https://registry.npmjs.org/@testing-library/dom/10.4.1) |
| `@testing-library/jest-dom` | `7.0.1` | MIT | [registry](https://registry.npmjs.org/@testing-library/jest-dom/7.0.1) |
| `@testing-library/react` | `16.3.3` | MIT | [registry](https://registry.npmjs.org/@testing-library/react/16.3.3) |
| `@testing-library/user-event` | `14.6.8` | MIT | [registry](https://registry.npmjs.org/@testing-library/user-event/14.6.8) |
| `@types/cookie-parser` | `1.4.10` | MIT | [registry](https://registry.npmjs.org/@types/cookie-parser/1.4.10) |
| `@types/express` | `5.0.6` | MIT | [registry](https://registry.npmjs.org/@types/express/5.0.6) |
| `@types/node` | `24.19.2` | MIT | [registry](https://registry.npmjs.org/@types/node/24.19.2) |
| `@types/pg` | `8.23.1` | MIT | [registry](https://registry.npmjs.org/@types/pg/8.23.1) |
| `@types/react` | `19.3.0` | MIT | [registry](https://registry.npmjs.org/@types/react/19.3.0) |
| `@types/react-dom` | `19.3.0` | MIT | [registry](https://registry.npmjs.org/@types/react-dom/19.3.0) |
| `@types/supertest` | `7.2.1` | MIT | [registry](https://registry.npmjs.org/@types/supertest/7.2.1) |
| `@vitejs/plugin-react` | `6.1.2` | MIT | [registry](https://registry.npmjs.org/@vitejs/plugin-react/6.1.2) |
| `argon2` | `0.45.1` | MIT | [registry](https://registry.npmjs.org/argon2/0.45.1) |
| `class-transformer` | `0.5.1` | MIT | [registry](https://registry.npmjs.org/class-transformer/0.5.1) |
| `class-validator` | `0.15.1` | MIT | [registry](https://registry.npmjs.org/class-validator/0.15.1) |
| `class-variance-authority` | `0.7.1` | Apache-2.0 | [registry](https://registry.npmjs.org/class-variance-authority/0.7.1) |
| `clsx` | `2.1.1` | MIT | [registry](https://registry.npmjs.org/clsx/2.1.1) |
| `cookie-parser` | `1.4.7` | MIT | [registry](https://registry.npmjs.org/cookie-parser/1.4.7) |
| `dependency-cruiser` | `18.7.0` | MIT | [registry](https://registry.npmjs.org/dependency-cruiser/18.7.0) |
| `eslint` | `9.39.5` | MIT | [registry](https://registry.npmjs.org/eslint/9.39.5) |
| `eslint-plugin-react-hooks` | `7.1.1` | MIT | [registry](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1) |
| `exceljs` | `4.4.0` | MIT | [registry](https://registry.npmjs.org/exceljs/4.4.0) |
| `express` | `5.3.0` | MIT | [registry](https://registry.npmjs.org/express/5.3.0) |
| `helmet` | `8.3.0` | MIT | [registry](https://registry.npmjs.org/helmet/8.3.0) |
| `jsdom` | `30.1.3` | MIT | [registry](https://registry.npmjs.org/jsdom/30.1.3) |
| `lucide-react` | `1.63.0` | ISC | [registry](https://registry.npmjs.org/lucide-react/1.63.0) |
| `openapi-typescript` | `7.13.0` | MIT | [registry](https://registry.npmjs.org/openapi-typescript/7.13.0) |
| `pg` | `8.23.1` | MIT | [registry](https://registry.npmjs.org/pg/8.23.1) |
| `pnpm` | `12.15.0` | MIT | [registry](https://registry.npmjs.org/pnpm/12.15.0) |
| `prettier` | `3.9.10` | MIT | [registry](https://registry.npmjs.org/prettier/3.9.10) |
| `prisma` | `7.10.1` | Apache-2.0 | [registry](https://registry.npmjs.org/prisma/7.10.1) |
| `radix-ui` | `1.8.1` | MIT | [registry](https://registry.npmjs.org/radix-ui/1.8.1) |
| `react` | `19.3.1` | MIT | [registry](https://registry.npmjs.org/react/19.3.1) |
| `react-dom` | `19.3.1` | MIT | [registry](https://registry.npmjs.org/react-dom/19.3.1) |
| `react-hook-form` | `7.91.0` | MIT | [registry](https://registry.npmjs.org/react-hook-form/7.91.0) |
| `react-router-dom` | `7.18.5` | MIT | [registry](https://registry.npmjs.org/react-router-dom/7.18.5) |
| `reflect-metadata` | `0.2.2` | Apache-2.0 | [registry](https://registry.npmjs.org/reflect-metadata/0.2.2) |
| `rxjs` | `7.8.2` | Apache-2.0 | [registry](https://registry.npmjs.org/rxjs/7.8.2) |
| `shadcn` | `4.23.0` | MIT | [registry](https://registry.npmjs.org/shadcn/4.23.0) |
| `supertest` | `7.3.1` | MIT | [registry](https://registry.npmjs.org/supertest/7.3.1) |
| `tailwind-merge` | `3.7.0` | MIT | [registry](https://registry.npmjs.org/tailwind-merge/3.7.0) |
| `tailwindcss` | `4.3.3` | MIT | [registry](https://registry.npmjs.org/tailwindcss/4.3.3) |
| `tsx` | `4.20.6` | MIT | [registry](https://registry.npmjs.org/tsx/4.20.6) |
| `typescript` | `5.9.3` | Apache-2.0 | [registry](https://registry.npmjs.org/typescript/5.9.3) |
| `typescript-eslint` | `8.72.1` | MIT | [registry](https://registry.npmjs.org/typescript-eslint/8.72.1) |
| `vite` | `8.3.5` | MIT | [registry](https://registry.npmjs.org/vite/8.3.5) |
| `vitest` | `5.0.5` | MIT | [registry](https://registry.npmjs.org/vitest/5.0.5) |
| `zod` | `4.6.7` | MIT | [registry](https://registry.npmjs.org/zod/4.6.7) |

## Quyết định pin và tương thích cần chứng minh

- Không chọn Prisma latest8.0.0-rc.28: client/adapter/CLI đồng bộ **7.10.1**. Prisma7 adapter-pg và pg đã liệt kê; schema/config/generate/migrate theo chính version này, không chép recipe Prisma6. ESM/NodeNext, decorator metadata Nest và test runner phải được spike kiểm, chưa claim build được.
- Không chọn TypeScript7.0.2: Swagger12 khai báo TypeScript5.5/6, openapi-typescript7.13 khai báo5.x, typescript-eslint8.72 yêu cầu<6.1; chọn **5.9.3** nằm giao các peer. Đây là lý do kỹ thuật, không chọn compiler mới nhất mặc định.
- React/React DOM19.3.1, types19.3.0 đồng bộ major; React Query5/RHF7/Radix1 cho phép React19 theo peers. Vite8.3.5/plugin-react6.1.2/Tailwind4.3.3/Vitest5 có khai báo peer phù hợp; jsdom30 yêu cầu Node24.15+, product24.22.1 vượt floor. Chưa đủ để kết luận hooks/DOM/touch đúng.
- ESLint9.39.5 và @eslint/js9.39.5 giữ cùng pin với pilot để giảm thay đổi root; typescript-eslint8.72 hỗ trợ ESLint9. Không nâng ESLint10 chỉ vì registry latest, không sửa baseline pilot để tránh test.
- @types/node24.19.2 thuộc runtime24; không lấy types26.6.5. Type package không là bằng chứng runtime hỗ trợ mọi API; code chỉ dùng API Node24 và build/test trên24.
- shadcn CLI4.23.0 là generator dùng khi cần; chọn nguồn Radix rõ ràng, không dùng default Base UI nếu CLI đổi mặc định. Lưu CLI version, registry item URL/content hash, upstream license và custom delta cho component thật khi lấy ở task6; CLI pin một mình không pin dynamic registry content. Nguồn component nhận qua generated diff/review, không ghi đè custom delta khi upgrade.
- @nestjs/throttler6.7.1 có peer Nest12; storage PostgreSQL custom theo auth-session, không dùng memory default để tuyên bố quota qua hai process đã enforce. Argon20.45.1 có native binding: task3 kiểm build/prebuilt đúng OS/architecture; không tắt install scripts để install xanh nhưng runtime lỗi.
- ExcelJS4.4.0 MIT dùng phía API, không browser bundle; cần kiểm formula cached values/recalc trên reader thật và license transitive. openapi-typescript7.13 + OpenAPI **3.0.3** là định dạng mục tiêu, dùng oneOf/discriminator và nullable theo3.0, không trộn3.1 nullable syntax.

## Evidence metadata và giới hạn

Đã đọc HTTPS npm registry cho các package trong bảng, ghi version/engine/peer/license công khai; exact pin query bổ sung cho Prisma7.10.1, TS5.9.3, ESLint9.39.5, types Node24.19.2, testing-library/dom10.4.1, tsx4.20.6. Query thử @types/node24.15.0 trả404; không dùng version đó, chọn bản24.19.2 tồn tại. Metadata ignored tại `.superpowers/sdd/implementation-plan/package-metadata.json`, không chứa token/nhân sự. Node index và PostgreSQL versioning đọc công khai. Không đọc/ghi secret hoặc dùng registry credential.

Metadata availability: Verified đúng các request đọc có kết quả trong lượt này. Full dependency resolution, engine strict/required peer, lockfile integrity, transitive licenses/security advisories, native binding, PostgreSQL17.11 identity, generate/build/type/contract/boundary/browser compatibility: **Not run**. G1 duyệt manifest không tự biến các check này thành đạt; task2 kiểm artifact cài thật, task3–10 kiểm use case thực.

## Acceptance spike task2 trước mở rộng code

1. Provision runtime24 executable project/run-owned theo quyền, `node --version` đúng, pnpm --version đúng, không đổi runtime22 của pilot.
2. pnpm install exact direct versions, resolve transitive vào pnpm-lock, strict required peers/engine đạt; đánh giá install scripts/license/advisory có finding cụ thể. Không tự tắt peer check hoặc skip native build để tránh lỗi.
3. Nest/TypeScript strict ESM + Prisma7 client/pg adapter kết nối DB thử đúng identity; migration/generation tối thiểu, build/run API và web riêng. Không NodeNext/.mjs import lỗi bị bỏ qua bằng transpile-only.
4. Swagger/OpenAPI3.0.3 sinh deterministically, openapi-typescript sinh kiểu5.9 compile được, fixture drift bị bắt. Boundary alias/public import valid pass, illegal/cycle fail.
5. Frozen install tái lập + product checks, sau đó npm check và npm test:e2e pilot dưới22.12.0. Chỉ kết luận chuyển lockfile xong khi check/review đúng final snapshot.

Nếu peer/engine/native compatibility thất bại, dùng systematic-debugging, đề xuất pin patch có bằng chứng và cập nhật manifest/lockfile trong scope, không đổi stack hoặc coi Failed thành Verified. Nếu cần thay major/contract ảnh hưởng G1 phải review phần thay đổi trước code phụ thuộc.
