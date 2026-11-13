# VueWeb Roster Management

Turns a roster copied from a team's website into the CSV layout vueWeb expects, ready to upload to Metadata Management.

## Before you paste

1. On the team's roster page, switch the view to **Grid** (sometimes called **Table**), not Card or List.
2. Select the whole roster table and copy it.
3. Paste it exactly as copied. The tool strips out social links, class, height, hometown and the rest, keeping Number, Name and Position.

## Single Roster

1. Pick the **sport** and enter the **team name** as it should appear.
2. Choose a **name format**: full name, last name only, `Tricode_Num_LastName` (UVA_6_WILLIAMS) or `Tricode_Number` (UVA_6). Tricode formats need the **team tricode**.
3. Choose an **output format**:
   - **Header style**: team name row, then 3-column player rows.
   - **Padded style**: everything padded to 6 columns.
4. Paste the roster. Check the player count and **click any cell in the preview to fix it**.
5. **Download CSV**.

## Game Setup

Builds a whole game package at once: **home roster**, **away roster** and a **play-tags** file.

1. Pick the sport, name format and output format (applies to both teams).
2. Fill in the home and away team names and tricodes, and paste each roster.
3. Under **Game Play Tags**, click **Load defaults for this sport**, then edit: one tag per line, numbered in the order listed.
4. **Generate Game Files**.

## Notes

- Supported: football, basketball, soccer, volleyball, baseball, softball, lacrosse, field hockey, hockey, tennis. Wrestling, track & field, gymnastics and bowling are marked with an asterisk in the tool; check their output closely.
- Everything runs in your browser; rosters aren't uploaded anywhere.
