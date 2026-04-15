# Visual Composition Preview Feature

Adding a real-time Visual Preview tab is an incredible idea. This will give you instant visual feedback on exactly how your settings (backgrounds, offsets, sizing, and corner radius) will translate to the final 1080p video without having to actually run a rendering job!

I will implement a "Tabs" system in the middle panel and build a purely mathematical CSS representation of the final FFmpeg render engine.

## Proposed Changes

### 1. UI & Layout Updates
#### [MODIFY] [index.html](file:///d:/video-recorder/src/index.html)
- Inject a CSS-styled Tab Bar (`Flow Steps` | `Visual Preview`) at the top of the Center Panel.
- Wrap the existing flow list inside a `<div id="flowView">`.
- Create a new `<div id="previewView">` which acts as our CSS rendering stage.
- Inside the preview view, I will build a canvas wrapper that uses modern CSS container queries (`container-type: inline-size`). This allows us to perfectly ratio and scale the 1920x1080 geometry down to fit nicely in your app interface.

#### [MODIFY] [index.css](file:///d:/video-recorder/src/index.css)
- Add styling for `.tabs`, `.tab`, and `.tab.active`.
- Add styling for the preview geometry, adding drop-shadows to the dummy window so it matches the aesthetic of a polished video recording.

### 2. Logic Updates
#### [MODIFY] [app.js](file:///d:/video-recorder/src/app.js)
- Add click listeners to the Tab buttons to seamlessly toggle between the Flow Builder and the Preview canvas.
- Write a core `updatePreview()` rendering function.
- **The Math:** The rendering function will take the 1920x1080 resolution and map it to `100cqw` (CSS Container Query Width). By multiplying any of your absolute inputs (like `1280` or `offset: 40`) by `100/1920`, we get mathematically perfect 1:1 scaled rendering coordinates. 
- Attach event listeners (on `input` and `change`) to *all* sidebar settings (Background, Size, Alignment, Offsets, Border Radius). Every time you tweak a number, the Preview canvas will immediately snap to the newly calculated coordinates and sizing.

## Verification
- Switch to the Preview tab.
- Change the background image: the preview should instantly load the custom image.
- Change the alignment to "Bottom Right" and type `150` into Offset X: the preview window should instantly anchor down and bleed off the right boundary exactly as it will in FFmpeg.

Let me know if this sounds good and I'll build it instantly!
