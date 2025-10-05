const args = process.argv.slice(2);
if (args.length >= 2) {
  const regex = args[0];
  console.log(`Regex: ${regex}`);
  const values = args.slice(1);
  console.log("Values:");
  for (const value of values) {
    console.log(`${value}: ${new RegExp(regex).test(value)}`);
  }
}
