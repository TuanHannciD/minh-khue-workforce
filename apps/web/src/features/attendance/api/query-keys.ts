export const attendanceKeys = {
  all: ["attendance"] as const,
  month: (month: string, userId: string | undefined, epoch: number) =>
    ["attendance", userId, epoch, month] as const,
};
