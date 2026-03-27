# Test Fixtures

Add one unoptimized sample file to each folder under `tests/fixtures/formats`.

The integration tests copy these fixtures into a temporary workspace before running the API so the source fixtures are never mutated.

After adding the files, run:

```bash
bun run fixture-values -- --mode default tests/fixtures/formats/png/sample.png
```

Use the reported values to replace the placeholder expectations in `tests/helpers/fixture-manifest.ts`.
