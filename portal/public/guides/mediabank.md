# Media Bank Integration

Builds a ready-to-install `.efp` that connects a DreamCatcher to a school's MediaBank storage.

## Steps

1. Pick the **school**. Its bucket fills in automatically.
2. Enter the **Vue username** the integration should be set up for.
3. Tick **Include MediaBank export/upload** to also add the cloud tab and export profile.
4. **Generate EFP**, then install it on the server.

## Test Mode

Turn on **Test Mode** to use the shared dev credentials and any S3 folder (prefix) you choose. The file name and package details are marked **TEST** so a test package is never mistaken for a real one.

## Notes

- The school list shows when it was generated and how many schools it holds. Ask for an update if a school is missing.
- This tool contains each school's storage credentials. Don't share the page's HTML outside the team.
