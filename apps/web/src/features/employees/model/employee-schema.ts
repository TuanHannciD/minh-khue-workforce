import { z } from "zod";
const date = z.iso
  .date()
  .refine(
    (value) => !value.startsWith("0000"),
    "Ngày phải thuộc năm 0001–9999.",
  );
export const employeeSchema = z
  .object({
    name: z.string().refine((value) => {
      const n = Array.from(value.trim()).length;
      return n >= 1 && n <= 200;
    }, "Nhập họ và tên từ 1 đến 200 ký tự."),
    startDate: z
      .string()
      .refine(
        (value) => date.safeParse(value).success,
        "Nhập ngày bắt đầu hợp lệ theo YYYY-MM-DD.",
      ),
    endDate: z
      .string()
      .refine(
        (value) => value === "" || date.safeParse(value).success,
        "Nhập ngày kết thúc hợp lệ theo YYYY-MM-DD.",
      ),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
  });
