console.error(
  `Not run: ${process.argv[2]} requires ${process.argv[3]} implementation and its owned sandbox. This command does not satisfy acceptance.`,
);
process.exitCode = 2;
