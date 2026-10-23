# Yêu cầu đã duyệt — MKW-AGENT-001

Nguồn xác nhận: cuộc trao đổi với người dùng ngày 23/10/2026; sau bản tổng kết, người dùng nói “Đồng ý với đề xuất bước tiếp theo hãy bắt đầu”.

## Kết quả cần đạt

Viết tài liệu nền tảng để AI Agent làm việc có quy trình sạch, tự thực hiện phần đã duyệt và bàn giao kết quả có bằng chứng. Ưu tiên hiện tại là skill, rule, công cụ và cách vận hành; nghiệp vụ chấm công sẽ được làm rõ sau.

## Nội dung đã thống nhất

- Superpowers là phương pháp phát triển chủ đạo; chuyên môn Minh Khuê bổ sung thay vì tạo workflow thứ hai.
- Impeccable là chuyên môn UI/UX chính; UI UX Pro Max là tham chiếu bổ sung.
- Tài liệu riêng của project dùng một nguồn tiếng Việt, mỗi quy định có một nơi sở hữu.
- Workflow: nhận việc/làm rõ → phương án/kế hoạch → thực hiện → kiểm thử/review/sửa/xác minh → nghiệm thu → tích hợp/phát hành theo quyền.
- Agent chính chịu trách nhiệm xuyên suốt, dùng Agent con khi phù hợp và được phép.
- Mỗi task có hồ sơ để chuyển phiên và tiếp tục đúng bước.
- Dùng T3 Browser cho thao tác trực tiếp; Playwright Test cho luồng có thể chạy lại. Playwright MCP là lựa chọn bổ sung khi có nhu cầu và khả năng thực tế.
- Có điều kiện nghiệm thu thao tác UI thật xuyên suốt web–API–DB, debug bằng bằng chứng và kiểm lại sau sửa.
- Cần pilot nền tảng: rule/skill routing, test lỗi, review, resume và bảo toàn tài nguyên.
- Phân biệt đã viết tài liệu, đã cài đặt và đã kiểm chứng hoạt động.

## Trong phạm vi task này

Tạo bộ tài liệu và template thực tế, kiểm tra tính nhất quán/liên kết, ghi trạng thái và bước tiếp theo. Các chi tiết vận hành cụ thể hóa phải bám phạm vi trên; lựa chọn chưa có dữ kiện được đánh dấu Pending.

## Ngoài phạm vi task này

Cài/copy skill hoặc plugin; cấu hình global/MCP; khởi tạo Git; dispatch Agent con; tạo lịch; chạy pilot ứng dụng; dựng framework/DB; chọn công nghệ hoặc quy tắc chấm công; remote/push/merge/deploy. Không kế thừa quyền SellerFlow sang Minh Khuê.
