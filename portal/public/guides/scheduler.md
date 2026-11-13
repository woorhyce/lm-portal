# Scheduler Builder

Turns a season schedule into a file of DreamCatcher scheduler events, for any school and sport, so recordings start on their own at kickoff.

## Steps

1. **Import home games**: paste one game per line as `Opponent, Date, Time`, separated by commas, tabs or pipes. Dates can be `YYYY-MM-DD`, `M/D/YYYY` or `Mon D, YYYY`. Pasting straight from a spreadsheet works. Click **Add to schedule**.
2. **Set defaults** for every row: sport label, task, input, output and duration.
   - **shadowexport**: a growing-file recording.
   - **clipplayback**: plays a clip at a set time.
   Click **Apply defaults to all rows**.
3. **Review & edit**: change any game's name, date, start, duration, task, input or output. **+ Add game** for anything missing.
4. **Export .xlsx** or **Export .csv**, whichever your scheduler import expects.

## What's in the file

Columns: `name, schedule_id, start, end, event_id, task, input_type, input, output_type, output, event_params`.

- Names come out as **{Sport} vs {Opponent}**.
- `start` / `end` are full datetimes; end = start + duration.
- `schedule_id`, `event_id` and `event_params` are left blank so the system assigns them.
- `input_type` / `output_type` follow the task: shadowexport → `record_train` / `profile`; clipplayback → `clips` / `dreamcatcher_outputs`.

## Tip

Pad the duration for overtime and extra innings; recording starts at the listed game time.
