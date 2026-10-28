# Tooling sản phẩm — Task2

Root npm scripts giữ pilot; nhóm `product:*` chạy bằng Node24/pnpm12 theo [LOCAL_RUN](../../docs/agent/LOCAL_RUN.md). Hai app chỉ có bootstrap; không có module nhân sự/chấm công/auth.

- `check-boundaries.mjs` đọc tsconfig từng app, tạo đồ thị dependency-cruiser với alias/ESM/type imports, kiểm cycle và chuyển cạnh qua `boundary-rules.mjs`. Public feature/module entry là `index.ts`; import cùng feature dùng đường tương đối. Shared/infrastructure không gọi ngược app/feature/module. Web không dùng server/Prisma. ESLint restricted imports bổ sung feedback tại source; graph checker bắt cả đường tương đối và alias.
- `generate-contract.mjs` nhận document từ `apps/api/src/openapi.ts` đã compile, canonicalize/format, sinh `contracts/openapi.json` và `apps/web/src/shared/api/generated/schema.d.ts`. Hai output thuộc generator, không sửa tay. `check-contract.mjs` sinh lại vào ignored artifact mới rồi so bytes; `--candidate-dir` chỉ dành fixture deliberate drift.
- `staged-gate.mjs` báo Not run/exit2 cho integration nghiệp vụ, product E2E và benchmark chưa đến task sở hữu (pnpm filter wrapper trả1). Không có no-tests pass hoặc kết quả acceptance giả.

Fixtures ở `tests/product-tooling`: import hợp lệ/vi phạm, ESLint, cycle, compiler strict/generated consumer và drift. `pnpm run product:check` kiểm build từng app rồi chạy tooling + web Vitest + API bootstrap HTTP thật + boundary/contract. Web test hiện dùng HTTP fixture thật, chưa dùng Testing Library/DOM/gesture vì chưa có component nghiệp vụ.

Web alias `@/` khớp Vite/tsconfig. API ESM dùng alias native `#app/*` khớp package imports/tsconfig và `.js` specifier; không cần loader hoặc rewrite sau compile. Test API chạy compiled JS để bắt lỗi ESM/decorator metadata/runtime alias. Không import Prisma/entity qua contract generated.
