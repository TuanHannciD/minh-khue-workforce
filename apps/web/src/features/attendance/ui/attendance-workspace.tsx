import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/session/index";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ConfirmDiscard } from "@/shared/ui/confirm-discard";
import type { AttendanceDraft } from "../model/attendance-draft";
import type { AttendanceKind, EmployeeDto, PageCriteria } from "../model/types";
import {
  adoptAttendancePage,
  useAttendancePage,
} from "../api/use-attendance-page";
import { invalidateAttendancePages } from "../api/query-keys";
import { useAttendanceDraft } from "../model/use-attendance-draft";
import { usePageView } from "../model/use-page-view";
import {
  canPollPage,
  isPageTransitionCurrent,
  samePageCriteria,
} from "../model/page-view";
import type { PageTransitionTicket } from "../model/page-view";
import { toPageTable } from "../model/attendance-read-view";
import { AttendancePage } from "./attendance-page";
import { AttendancePagination } from "./attendance-pagination";
import { AttendanceSearch } from "./attendance-search";
import { ExportButton } from "./export-button";

export function AttendanceWorkspace({
  draft: owner,
  onEmployee,
}: {
  draft: AttendanceDraft;
  onEmployee: (employee: EmployeeDto) => void;
}) {
  const draft = useAttendanceDraft(owner);
  const { session, runtime } = useSession();
  const client = useQueryClient();
  const holdMembership = Boolean(draft.edit);
  const [initial] = useState<PageCriteria>(() => ({
    month:
      draft.edit?.month ??
      `${new Date().getFullYear().toString().padStart(4, "0")}-${(new Date().getMonth() + 1).toString().padStart(2, "0")}`,
    q: "",
    page: 1,
    pageSize: 25,
  }));
  const view = usePageView(
    initial,
    {
      userId: session?.user.userId ?? "",
      epoch: runtime.boundary.current(),
      generation: 1,
    },
    holdMembership,
  );
  const query = useAttendancePage(
    view.state.desired,
    view.state.lifetime,
    canPollPage(view.state),
  );
  const { accept, request } = view;
  const { deferred, displayed, desired, lifetime } = view.state;
  const [raw, setRaw] = useState("");
  const [kind, setKind] = useState<AttendanceKind>(
    () => draft.edit?.cell.kind ?? "work",
  );
  const [guard, setGuard] = useState<{
    ticket: PageTransitionTicket;
    action: () => void;
    membership: boolean;
  } | null>(null);
  const currentOwner = useRef(owner);
  const [dismissedDeferred, setDismissedDeferred] = useState<Pick<
    PageTransitionTicket,
    "owner" | "generation" | "epoch"
  > | null>(null);
  const resetScrollAfter = useRef(false);
  const focusAfter = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    currentOwner.current = owner;
  });
  const locked = draft.outcome.type === "pending" || draft.reconciling;
  // The exact producer delivery goes through one accept/adopt path, including
  // deferred release. Adoption happens before the canonical criteria rerender.
  useEffect(() => {
    const delivery = !holdMembership && deferred ? deferred : query.data;
    if (!delivery) return;
    if (accept(delivery) === "accepted") {
      adoptAttendancePage(client, delivery);
      const releasedDeferred = !holdMembership && Boolean(deferred);
      const resetScroll = resetScrollAfter.current || releasedDeferred;
      const focus = focusAfter.current || releasedDeferred;
      resetScrollAfter.current = false;
      focusAfter.current = false;
      if (resetScroll || focus) {
        queueMicrotask(() => {
          const region =
            root.current?.querySelector<HTMLElement>(".grid-scroll");
          if (resetScroll && region) region.scrollTop = 0;
          if (focus)
            root.current?.querySelector<HTMLElement>("#sheet-title")?.focus();
        });
      }
    }
  }, [query.data, deferred, holdMembership, accept, client]);
  const membershipTicket =
    deferred &&
    holdMembership &&
    !locked &&
    !(
      dismissedDeferred?.owner === owner &&
      dismissedDeferred.generation === owner.ownerGeneration &&
      dismissedDeferred.epoch === owner.boundary.current()
    )
      ? {
          owner,
          epoch: owner.boundary.current(),
          generation: owner.ownerGeneration,
          next: desired,
        }
      : null;
  const activeGuard =
    guard &&
    guard.ticket.owner === owner &&
    guard.ticket.generation === owner.ownerGeneration &&
    owner.boundary.canWrite(guard.ticket.epoch)
      ? guard
      : membershipTicket
        ? { ticket: membershipTicket, membership: true, action: () => {} }
        : null;
  const ticketCurrent = (ticket: PageTransitionTicket) =>
    ticket.owner === currentOwner.current && isPageTransitionCurrent(ticket);
  function transition(next: PageCriteria, action: () => void) {
    if (locked || activeGuard) return;
    const ticket = {
      owner,
      generation: owner.ownerGeneration,
      epoch: owner.boundary.current(),
      next,
    };
    if (!ticketCurrent(ticket)) return;
    if (draft.edit) {
      const decision = { ticket, action, membership: false };
      setGuard(decision);
    } else action();
  }
  function navigate(next: PageCriteria, focus = true) {
    if (samePageCriteria(next, desired)) return;
    transition(next, () => {
      resetScrollAfter.current = true;
      focusAfter.current = focus;
      request(next);
    });
  }
  const data = displayed?.delivery.data;
  const table = useMemo(() => (data ? toPageTable(data) : null), [data]);
  const readOnly =
    !canPollPage(view.state) ||
    query.isFetching ||
    query.isError ||
    Boolean(deferred);
  const reload = () => {
    if (!session) return;
    void invalidateAttendancePages(
      client,
      data?.month ?? desired.month,
      session.user.userId,
      runtime.boundary.current(),
    );
  };
  const onPage = (page: number) => {
    if (displayed) navigate({ ...displayed.criteria, page });
  };
  const onPageSize = (pageSize: 25 | 50) => {
    if (displayed) navigate({ ...displayed.criteria, pageSize, page: 1 });
  };
  return (
    <div ref={root}>
      <div className="month-control">
        <label htmlFor="attendance-month">Tháng chấm công</label>
        <Input
          id="attendance-month"
          type="month"
          value={desired.month}
          disabled={locked}
          onChange={(event) => {
            const month = event.target.value;
            if (
              /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
              !month.startsWith("0000")
            )
              navigate({ ...desired, month, page: 1 });
          }}
        />
        <Button
          disabled={locked}
          onClick={() => {
            void query.refetch();
          }}
        >
          Tải lại bảng
        </Button>
      </div>
      <AttendanceSearch
        value={raw}
        disabled={locked}
        onValue={setRaw}
        onCommit={(q) => navigate({ ...desired, q, page: 1 }, false)}
      />
      <ExportButton
        key={`export-${data?.month ?? desired.month}`}
        month={data?.month ?? desired.month}
        boundary={runtime.boundary}
      />
      {data && (
        <div className="snapshot-freshness" aria-live="polite">
          <p>Snapshot đã lưu lúc {data.fetchedAt}.</p>
          <p role="status">
            Tháng {data.month} · {data.pagination.from}–{data.pagination.to} /{" "}
            {data.pagination.totalResults} kết quả ·{" "}
            {data.pagination.monthEmployeeCount} nhân sự trong tháng
            {displayed?.criteria.q ? ` · Tìm: ${displayed.criteria.q}` : ""}.
          </p>
          {readOnly && !query.isError && (
            <p role="status">
              {deferred
                ? "Trang đã thay đổi; phần nhập và snapshot đang được giữ."
                : "Đang tải trang…"}
            </p>
          )}
          {data.pagination.requestedPage !== data.pagination.page && (
            <p>
              Trang yêu cầu {data.pagination.requestedPage} đã được điều chỉnh
              về trang {data.pagination.page}.
            </p>
          )}
          {query.isError && (
            <div role="alert">
              <p>
                Chưa tải được trang yêu cầu. Bảng và tổng vẫn thuộc trang đã
                tải; bản nháp được giữ.
              </p>
              <Button
                onClick={() => {
                  void query.refetch();
                }}
              >
                Thử lại
              </Button>
              <Button
                disabled={locked}
                onClick={() =>
                  transition(displayed!.criteria, () => {
                    resetScrollAfter.current = true;
                    focusAfter.current = true;
                    request(displayed!.criteria);
                  })
                }
              >
                Quay về trang đã tải
              </Button>
            </div>
          )}
        </div>
      )}
      <AttendancePage
        status={data ? "ready" : query.isError ? "error" : "loading"}
        month={table}
        readOnly={readOnly}
        selectionContextKey={JSON.stringify([
          displayed?.criteria,
          lifetime.userId,
          lifetime.epoch,
          lifetime.generation,
        ])}
        kind={kind}
        onKindChange={(next) => transition(desired, () => setKind(next))}
        topControls={
          data && (
            <AttendancePagination
              pagination={data.pagination}
              disabled={locked || readOnly}
              onPage={onPage}
              onPageSize={onPageSize}
              position="top"
            />
          )
        }
        bottomControls={
          data && (
            <AttendancePagination
              pagination={data.pagination}
              disabled={locked || readOnly}
              onPage={onPage}
              onPageSize={onPageSize}
              position="bottom"
            />
          )
        }
        onSubmit={() => {}}
        onRetry={() => {
          void query.refetch();
        }}
        draft={draft}
        ownerUserId={session?.user.userId ?? ""}
        onSaved={reload}
        onEmployee={onEmployee}
      />
      {activeGuard && (
        <ConfirmDiscard
          title={
            activeGuard.membership
              ? "Trang đã thay đổi khi có phần nhập"
              : "Giữ hay bỏ phần nhập"
          }
          discardLabel={
            activeGuard.ticket.next.month !== desired.month
              ? "Bỏ phần nhập và đổi tháng"
              : "Bỏ phần nhập và tiếp tục"
          }
          onKeep={() => {
            if (membershipTicket) setDismissedDeferred(membershipTicket);
            setGuard(null);
          }}
          onDiscard={() => {
            const decision = activeGuard;
            if (
              ticketCurrent(decision.ticket) &&
              decision.ticket.owner.discard()
            )
              decision.action();
            setGuard(null);
          }}
        >
          <p>
            Giữ phần nhập và trang đã tải, hoặc bỏ phần nhập để tiếp tục. Bỏ
            phần nhập không hủy yêu cầu đã gửi.
          </p>
        </ConfirmDiscard>
      )}
    </div>
  );
}
