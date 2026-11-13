# LM Core Builder

Draws the rear and front plates of an LM-CORE or DC-ONE build, with every port labelled, and exports it as a PNG for documentation, quotes or site packs.

## Build a server

Work down the left rail:

1. **Model**: LM-CORE-SC (silver, Mini DisplayPort), LM-CORE-HC (gold, DisplayPort), DC-ONE-SE or DC-ONE-LX. DC-ONE models have their input type, card and front slot fixed.
2. **Input type**: None, Baseband or 2110.
3. **Card**: for Baseband, the 4-, 8- or 12-port SDI card, then the wiring (for example HD 6×2: 6 in, 2 out). For 2110, the 25G or 50G Matrox card.
4. **Front PCIe slot**: LTC plate, empty (vented blank) or the LM-25GE 25GbE NIC, which adds ENET 5 and 6.

The drawing updates as you go and shows rack units, dimensions, weight, power and heat underneath.

## Timing warnings

The 12-port SDI card takes LTC through a plate in the front slot. If you put the LM-25GE there or leave it empty, the build has no LTC input and the tool asks you to choose: keep the LTC plate, switch to the 8-port card (which has LTC on the card), or confirm the server will use PTP or NTP.

## Export

**Export PNG**, then **Save PNG**, **Copy image** or **Open in new tab**. If a button is blocked where you're viewing it, right-click the picture and use Copy image or Save image as.

## Tips

- Your last build is remembered and follows you to any computer you log in from.
- 2110 channel limits per card are still placeholders.
