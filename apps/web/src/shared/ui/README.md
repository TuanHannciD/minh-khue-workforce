# UI nền Minh Khuê

Button/Input/Tabs là derivative có scope của shadcn/ui nền **Radix**, MIT ©2023 shadcn; giữ giấy phép tại [LICENSE](LICENSE.md). Không dùng Base UI. Lấy registry ngày29/10/2026 qua HTTPS, đọc source rồi tùy biến local; không chạy CLI hoặc giả rằng pin CLI khóa registry động.

| Component | Registry đã lấy                                          | SHA-256 nội dung JSON nguyên bản                                   |
| --------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Button    | <https://ui.shadcn.com/r/styles/new-york-v4/button.json> | `4b8d7d848742727973c1b088af8d15f0b628272a1316f2d2fa344e73ddff9e9c` |
| Input     | <https://ui.shadcn.com/r/styles/new-york-v4/input.json>  | `b1fffa12ba72ce30a291749012b47235eda110648b8106725ced22b5b31c8f1b` |
| Tabs      | <https://ui.shadcn.com/r/styles/new-york-v4/tabs.json>   | `49320e6dcf56570753bb14ed3f5d66acf07d12e183c0e9024466995b25be5b1d` |

Raw registry và license giữ trong ignored evidence `.agent-runs/MKW-PRODUCT-001/task6-ui/upstream-*`. Nâng cấp phải lấy lại hash/diff, giữ custom delta và chạy consumer tests; không regenerate ghi đè source này.

Pins G1 đang dùng: radix-ui1.8.1, class-variance-authority0.7.1, clsx2.1.1, tailwind-merge3.7.0; Tailwind/@tailwindcss/vite4.3.3, lucide-react1.63.0. shadcn4.23.0 là pin generator được duyệt nhưng không cần cài/chạy cho cách lấy source này.

Delta: giữ slot metadata, cn/cva và component prop forwarding (kể cả ref React19); Button chỉ có native button/default/primary cần cho form, mặc định type=button để không submit nhầm, bỏ asChild/size/variants chưa dùng. Input giữ native semantics/props/ref, không wrapper thêm. Tabs giữ Root/List/Trigger/Content Radix và keyboard ARIA; style line tabs theo C, bỏ variant/dark theme chưa có consumer. Không có consumer Dialog nên chưa tạo/cài scaffold Dialog.

Visual truth: [UI_SYSTEM](../../../../../docs/architecture/UI_SYSTEM.md) và [C hiện hành](../../../../../docs/tasks/MKW-PRODUCT-001/ui/attendance-c.html). Tokens ở `shared/styles/tokens.css`; CSS attendance ở feature. Tailwind chỉ theme/utilities, không preflight để bảo toàn native form hiện có. Màu/font/radius/focus theo C; 44px minimum controls, không outline-none hoặc khóa zoom. Business/reminder/parser không vào primitive.

Consumers: login và employee form dùng Button/Input, app shell dùng Button; attendance dùng cả ba primitives, reminder checkbox native có label lớn. Kiểm `pnpm --filter @mkw/web test --run` và `pnpm run product:check` trên runtime [LOCAL_RUN](../../../../../docs/agent/LOCAL_RUN.md); Radix không tự chứng minh accessibility của sản phẩm.

Task7 thêm `confirm-discard.tsx` có consumer thật ở attendance/month/employee switch: component tự viết trên AlertDialog của radix-ui1.8.1 đã cài, không lấy thêm registry source. Portal/overlay/modal focus/Escape và nút giữ/bỏ dùng Button hiện có; tokens ở shared styles, nội dung nghiệp vụ do consumer truyền. Đây thay câu “chưa có consumer Dialog” của checkpoint Task6; không có generic Dialog scaffold.
