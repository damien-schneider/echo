# apps/web

This directory contains the web application for Echo.

## Testing

This project does not currently have any tests. The `test` script in `package.json` uses the `--passWithNoTests` flag to ensure that the test command exits with a success code in CI environments. This prevents the build from failing due to the absence of test files.

When tests are added to this project, the `--passWithNoTests` flag should be removed.
