async getDiagnostics() {
  const [
    studentsRow,
    professorsRow,
    schoolsRow,
    roomsRow,
    tasksRow,
    essaysRow,
    warnedRow,
    scheduledRow,
    usersRow,
  ] = await Promise.all([
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM user_entity WHERE LOWER(role) = 'student'`,
    ),
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM user_entity WHERE LOWER(role) = 'professor'`,
    ),
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM user_entity WHERE LOWER(role) IN ('school','escola')`,
    ),
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM room_entity`,
    ),
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM task_entity`,
    ),
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM essay_entity`,
    ),
    this.dataSource.query(`
      SELECT COUNT(*)::int AS n
      FROM user_entity
      WHERE LOWER(role) = 'student'
        AND "inactivityWarnedAt" IS NOT NULL
    `),
    this.dataSource.query(`
      SELECT COUNT(*)::int AS n
      FROM user_entity
      WHERE LOWER(role) = 'student'
        AND "scheduledDeletionAt" IS NOT NULL
    `),
    this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM user_entity`,
    ),
  ]);

  const students = Number(studentsRow?.[0]?.n || 0);
  const professors = Number(professorsRow?.[0]?.n || 0);
  const schools = Number(schoolsRow?.[0]?.n || 0);
  const rooms = Number(roomsRow?.[0]?.n || 0);
  const tasks = Number(tasksRow?.[0]?.n || 0);
  const essays = Number(essaysRow?.[0]?.n || 0);
  const warned = Number(warnedRow?.[0]?.n || 0);
  const scheduled = Number(scheduledRow?.[0]?.n || 0);
  const users = Number(usersRow?.[0]?.n || 0);

  return {
    ok: true,
    now: new Date().toISOString(),

    counts: {
      // NOVO MODELO
      students,
      professors,
      schools,
      rooms,
      warned,
      scheduled,

      // COMPATIBILIDADE (não quebra frontend antigo)
      users,
      tasks,
      essays,
    },
  };
}
