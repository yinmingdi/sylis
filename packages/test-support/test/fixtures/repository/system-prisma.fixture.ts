test("SYSTEM-002 bypasses the service boundary", async () => {
  await prisma.user.create({ data: { email: "invalid@example.test" } });
});
