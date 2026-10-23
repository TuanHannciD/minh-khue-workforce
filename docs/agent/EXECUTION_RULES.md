# Cách vận hành task

Tài liệu này quy định hồ sơ, ownership và handoff của Minh Khuê. Superpowers sau khi cài sở hữu kỹ thuật thực hiện từng bước; không tạo một lifecycle cạnh tranh. Quyền ở [PERMISSIONS](PERMISSIONS.md), kiểm tra/review/Done ở [QUALITY_GATES](QUALITY_GATES.md).

## Vòng làm việc duy nhất

1. **Nhận và khôi phục:** đọc mục tiêu, hồ sơ đã có, next action và quyền; kiểm tra workspace/thay đổi đang tồn tại.
2. **Làm rõ và chuẩn bị:** xác định actor/kết quả, scope/ngoài scope, acceptance và phương án/kế hoạch. Tái dùng nội dung đã duyệt, chỉ hỏi phần mới có tác động.
3. **Thực hiện:** sau khi scope/kế hoạch cần duyệt đã được xác nhận, tự tiếp tục công việc được phép, báo tiến độ có ý nghĩa.
4. **Kiểm chứng:** test, review, sửa và xác minh theo quality gates; khi lỗi dùng evidence để tìm nguyên nhân.
5. **Bàn giao/nghiệm thu:** kết quả, bằng chứng, giới hạn, finding còn mở, tài nguyên và bước tiếp theo.
6. **Tích hợp/phát hành:** khi thuộc scope/quyền; xác minh hậu điều kiện. Nếu chưa thuộc scope, task bàn giao local vẫn có thể Done khi acceptance của nó đạt.

Người dùng không phải giao lại từng thao tác backend/test/review/sửa trong kế hoạch đã được phép. Khi gặp blocker lặp, ghi giả thuyết, điều đã thử và lý do đổi hướng; tránh lặp lại cùng thao tác không thêm bằng chứng.

## Trạng thái task

`Draft → Ready → In progress → In review → Ready for acceptance → Done`.

`Blocked` phải có nguyên nhân, phần phụ thuộc và điều kiện gỡ. Có thể gộp các trạng thái trung gian cho task tài liệu nhỏ; ghi rõ review độc lập có được yêu cầu/thực hiện hay không. Done không đồng nghĩa integrated hoặc released.

## Hồ sơ và base

Dùng [TASK_BRIEF](../templates/TASK_BRIEF.md). Task đủ lớn tạo:

```text
docs/tasks/<task-id>/
  INDEX.md
  approved/requirements.md
  technical/implementation-plan.md
  decisions.md
  validation.md
```

INDEX là cửa vào: trạng thái thật, yêu cầu/plan hiện hành, scope, ownership, resource và next action. `approved` chỉ chứa ý định có xác nhận; kế hoạch chưa duyệt phải ghi Draft/Pending. Validation chứa bằng chứng, không tự sửa nghiệp vụ.

Trước sửa ghi base SHA khi có Git, acceptance, risk, vùng file, writer/reviewer route và check. Bootstrap tài liệu chưa có Git được ghi rõ giới hạn như MKW-AGENT-001; không bịa base. Task triển khai sau bootstrap cần baseline Git và branch/worktree cách ly phù hợp.

## Ownership và Agent con

Agent chính chịu trách nhiệm điều phối và kết quả. Khi được phép dispatch, mỗi child nhận mục tiêu, acceptance, nguồn chuẩn, base, file zone, role đọc/ghi, check/resource và đầu ra cần trả. Reviewer chỉ đọc trừ khi được giao vai trò ghi riêng.

Writer đồng thời cần workspace và tài nguyên riêng; không chỉnh checkout của nhau. Worktree mới không mặc định chứa file chưa commit của parent; xác minh snapshot trước khi giao. Model/provider phải từ runtime live và tuân chỉ dẫn phiên, không hardcode trong rule.

Review route và tip theo QUALITY_GATES. Nếu dùng T3, lưu từng task ID; review round mới dùng delegated task mới theo API/chỉ dẫn runtime, không dùng backing child thread như một round mới. Việc tiếp tục implementer dùng cơ chế đúng runtime; không áp một API native lên T3.

## Resource và evidence

Ghi task/run owner của process, cổng, DB, browser và thư mục report trước khi acquire. Không dừng process chỉ dựa trên số cổng/PID hoặc chiếm DB/browser người dùng. Registry là hồ sơ; xác minh target/resource thật riêng.

Phân biệt Git worktree, thư mục artifact tạm của plan và hồ sơ task bền vững. Giữ evidence cần bàn giao ngoài output disposable; không tự xóa report vì bị Git ignore. Cleanup phải xác minh đúng ownership và kết quả release thực.

## Handoff và resume

Theo [HANDOFF](../templates/HANDOFF.md): ghi yêu cầu/quyền đã có, base/tip, việc xong, check/finding, resource giữ lại và đúng next action. Khi chuyển phiên đọc hồ sơ để tiếp tục, không dùng ledger cũ của plan khác.

Checkpoint giúp Agent được chạy lại tiếp tục đúng bước. Tự khởi động lại sau crash/chạy định kỳ cần runtime/trigger riêng và pilot; không hứa chỉ bằng tài liệu hoặc ledger.
