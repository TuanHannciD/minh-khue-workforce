# Mật khẩu tối thiểu 8 ký tự

Ngày: 11/11/2026. User đã duyệt đổi provision/reset từ 12 xuống 8 ký tự Unicode; giữ tối đa 1024 bytes UTF-8, Argon2id và quyền hai tài khoản ngang nhau.

- Base: `146de45de45b84611c329eb95919946c4057d941`; branch `fix/password-min-eight`, worktree riêng.
- Scope: validator mật khẩu dùng chung, unit test, policy auth và operator script tạo `admin`/`ckok1123` ở evidence local.
- Acceptance: hash/verify được 8 ký tự ASCII/Unicode; từ chối dưới 8 code points và trên 1024 bytes; không đổi password/session hiện có.
- Risk: chỉ đổi script không đủ vì API image cũ vẫn enforce 12; phải phát hành API mới trước khi provision. Không sửa nóng container.
- Writer: primary inline; review độc lập qua requesting-code-review, tối đa Sol/high.
- Tài nguyên: worktree này; runtime portable project đã có; operator script tại root checkout `.agent-runs/account-provision/`. Không truy cập DB sản phẩm khác.
- Next action: red/green kiểm thử → build/check → review → bàn giao release. Production hiện chưa được cập nhật; backup thật cần gate đúng DB đã tồn tại, không tái dùng INITIAL_EMPTY.
