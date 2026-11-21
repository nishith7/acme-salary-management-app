/** A YYYY-MM-DD string as the midnight-UTC Date that Prisma stores in a @db.Date column. */
export function calendarDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
