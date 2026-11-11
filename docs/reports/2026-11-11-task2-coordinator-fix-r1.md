# Task 2 — coordinator fix R1

- Mục tiêu: sửa toàn bộ F1–F6 của review R1, một SHA xuyên suốt backup → deploy → verify, fail closed theo exact run/artifact.
- Base: `9f899308d6fdf1508ab75421e56457cf20e1f9b2`; original `7f695fd757fd7218942e9e5a8e0386352eb954e1` đã cherry-pick thành `91972ae` trên branch cách ly `t3/fix-release-coordinator`.
- Scope: coordinator + trusted policy/transport, downstream artifact/correlation inputs, focused fixture tests. Không production, push, merge, Docker hoặc children.
- Acceptance: BACKUP và INITIAL_EMPTY_DEPLOYMENT chạy thực qua dispatch API; wait exact run/attempt; exact artifact IDs; freshness gate từ main; source linkage bằng manifest/build metadata; failure của mỗi stage làm coordinator fail; production approval giữ nguyên.
- Risk: high (Actions orchestration). Writer: implementer phiên này. Review route: coordinator/independent reviewer nhận exact final commit; không tự dispatch theo yêu cầu no children.
- Resource: checkout hiện tại và fixture temp task-owned; không server/DB/browser.
- Policy: canonical protected ref `main`; backup max age mặc định 24h, chính sách tối đa 24 giờ từ module policy tin cậy; timestamp tương lai và retention hết hạn luôn từ chối.
- Next action: behavioral fixtures RED→GREEN, focused checks, append kết quả và commit.
