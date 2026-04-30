# PHASE B PROMPT

## Content / User Prompt

(Follows CHAT HISTORY constraint. Initial user prompt includes context + instructions)


[CONTEXT]
This app is used by broadcasters to trigger rundown elements in real time.

# KNOWN UI ELEMENTS FOR SPECIFIED APPLICATIONS
The following canonical element names belong to the application(s) being analyzed.
Treat this vocabulary as a supplementary helper tool, not absolute ground truth.
While you should align with these canonical names and types when they accurately reflect the UI, always use your own judgment.
If the provided type seems inaccurate or misses a nuance based on the visual context, use the most appropriate type.

## Application: CUEZ AUTOMATOR

### Section: SYSTEM TRAY
- **System Tray Icon** `[Type: icon]`
  - Aliases: menu bar icon, automator tray icon
- **System Tray Panel** `[Type: panel]`
  - Aliases: menu bar panel, tray popup
- **Port Number** `[Type: display]`
  - Aliases: port number display, port 7070
- **IP Address** `[Type: display]`
  - Aliases: ip address display, 127.0.0.1
- **Open GUI** `[Type: button]`
  - Aliases: open gui button, blue open gui button

### Section: FIRST RUN SETUP
- **First Run Setup** `[Type: modal]`
  - Aliases: first run setup modal, initial setup, automator setup
- **Automator Name** `[Type: input]`
  - Aliases: automator name input, automator instance name
- **Pairing Code** `[Type: input]`
  - Aliases: pairing code input, pair code field

### Section: TOP BAR
- **Top Bar** `[Type: container]`
  - Aliases: automator top bar
- **Hamburger Menu** `[Type: icon]`
  - Aliases: hamburger menu icon, burger menu, menu icon, three lines icon
- **Choose Episode** `[Type: panel]`
  - Aliases: choose episode list, episode picker, episode list
- **CuezDeck Button Area** `[Type: container]`
  - Aliases: cuezdeck buttons row, cuezdeck pinned bar
- **Devices** `[Type: button]`
  - Aliases: devices button
- **Connection Status** `[Type: indicator]`
  - Aliases: connection status indicator, device connection status, red green status
- **Gear** `[Type: icon]`
  - Aliases: gear icon, settings gear, cog icon, ⚙
- **Settings Dropdown** `[Type: panel]`
  - Aliases: gear dropdown, settings menu
- **Script Overlay Toggle** `[Type: icon]`
  - Aliases: blue script icon, script overlay icon, script toggle icon
- **Automatic Scrolling** `[Type: toggle]`
  - Aliases: automatic scrolling toggle, auto-scroll toggle
- **Keyboard shortcuts** `[Type: menu_item]`
  - Aliases: keyboard shortcuts menu item
- **Macros** `[Type: menu_item]`
  - Aliases: macros menu item
- **Variables** `[Type: menu_item]`
  - Aliases: variables menu item
- **Rundown events** `[Type: menu_item]`
  - Aliases: rundown events menu item
- **Automatic scrolling** `[Type: menu_item]`
  - Aliases: automatic scrolling menu item
- **CuezDeck** `[Type: menu_item]`
  - Aliases: cuezdeck menu item
- **Project Settings** `[Type: menu_item]`
  - Aliases: project settings menu item

### Section: TRIGGER BOX
- **Trigger Box** `[Type: container]`
  - Aliases: main trigger area, trigger area, automator main view
- **Block Row** `[Type: row]`
  - Aliases: automator block row, trigger row
- **Block Badge** `[Type: badge]`
  - Aliases: block badge label, row badge
- **Block Title** `[Type: display]`
  - Aliases: block title display, row title
- **Block Subtitle** `[Type: display]`
  - Aliases: block subtitle display, row subtitle
- **Block Thumbnail** `[Type: icon]`
  - Aliases: thumbnail preview, row thumbnail
- **Play** `[Type: button]`
  - Aliases: play button, cue button, play/cue button, advance button
- **On Cue** `[Type: state]`
  - Aliases: on cue state, currently active block, cued block, red border state, active row
- **Step Button** `[Type: button]`
  - Aliases: coloured step button, step sub-button, secondary action button
- **Green Checkmark** `[Type: indicator]`
  - Aliases: green check, media download checkmark, successful download indicator, ✓
- **Countdown Timer** `[Type: countdown]`
  - Aliases: clip countdown, timecode countdown
- **Block Row 3-Dots Menu** `[Type: icon]`
  - Aliases: row 3-dots menu, block actions menu, ⋮
- **Configure automation** `[Type: menu_item]`
  - Aliases: configure automation menu item

### Section: BLOCK AUTOMATION CONFIGURATION PANEL
- **Block Automation Configuration Panel** `[Type: panel]`
  - Aliases: automation config panel, right side configuration panel, configuration sidebar
- **On Cue** `[Type: tab]`
  - Aliases: on cue tab
- **Steps** `[Type: tab]`
  - Aliases: steps tab
- **Timecode** `[Type: tab]`
  - Aliases: timecode tab
- **Next** `[Type: tab]`
  - Aliases: next tab
- **Blur** `[Type: tab]`
  - Aliases: blur tab
- **Settings** `[Type: tab]`
  - Aliases: settings tab
- **Condition** `[Type: dropdown]`
  - Aliases: condition dropdown, logic selector
- **Always** `[Type: menu_item]`
  - Aliases: always option, unconditional
- **If** `[Type: menu_item]`
  - Aliases: if option, if condition
- **If Else** `[Type: menu_item]`
  - Aliases: if-else option, branching condition
- **Field Selector** `[Type: dropdown]`
  - Aliases: field selector dropdown, condition field
- **Comparator** `[Type: dropdown]`
  - Aliases: comparator dropdown, condition operator
- **Value** `[Type: input]`
  - Aliases: value field, condition value, comparison value
- **Else Function Set** `[Type: panel]`
  - Aliases: else branch, else automation set
- **Automation Action Row** `[Type: action_row]`
  - Aliases: action row, function row, automation row
- **Add Automation** `[Type: button]`
  - Aliases: add automation button, + add automation
- **Device** `[Type: dropdown]`
  - Aliases: device dropdown, device selector
- **Function** `[Type: dropdown]`
  - Aliases: function dropdown, function selector, action selector
- **Input Value** `[Type: input]`
  - Aliases: input value field, value field input, function value, function input
- **Delay** `[Type: input]`
  - Aliases: delay field, delay input, milliseconds field
- **Dynamic Delay** `[Type: reference]`
  - Aliases: dynamic delay reference, delay from field
- **Action Row 6-Dots Menu** `[Type: icon]`
  - Aliases: action 6-dots menu, function 6-dots menu, row actions menu
- **Enabled** `[Type: toggle]`
  - Aliases: enabled toggle, enabled checkmark, green checkmark toggle
- **Duplicate** `[Type: menu_item]`
- **Copy** `[Type: menu_item]`
- **Paste Clipboard** `[Type: menu_item]`
  - Aliases: paste action

### Section: STEPS CONFIGURATION
- **Add Step** `[Type: button]`
  - Aliases: add step button, + add step, add step button button
- **Step Name** `[Type: input]`
  - Aliases: step name field, step label input
- **Step Colour** `[Type: picker]`
  - Aliases: step colour picker, step color picker
- **Add Visibility Condition** `[Type: button]`
  - Aliases: add visibility condition button, visibility condition button

### Section: CUEZDECK CONFIGURATION
- **CuezDeck** `[Type: panel]`
  - Aliases: cuezdeck configuration panel, cuezdeck settings
- **Add CuezDeck Button** `[Type: button]`
  - Aliases: add cuezdeck button button, + add cuezdeck button
- **CuezDeck Button Name** `[Type: input]`
  - Aliases: cuezdeck button name field, deck button name
- **CuezDeck Button Type** `[Type: dropdown]`
  - Aliases: cuezdeck button type selector, deck button type
- **CuezDeck Button Colour** `[Type: picker]`
  - Aliases: cuezdeck button colour picker, deck button color picker
- **Button** `[Type: menu_item]`
  - Aliases: button type option
- **Status** `[Type: menu_item]`
  - Aliases: status type option
- **Timer** `[Type: menu_item]`
  - Aliases: timer type option
- **Device Property Listener** `[Type: dropdown]`
  - Aliases: device property listener dropdown, property listener selector

### Section: KEYBOARD SHORTCUTS PANEL
- **Keyboard Shortcuts Panel** `[Type: panel]`
  - Aliases: keyboard shortcuts panel container, shortcuts configuration panel
- **Add Shortcut** `[Type: button]`
  - Aliases: add shortcut button, + add shortcut
- **Record Key** `[Type: icon]`
  - Aliases: blue keyboard icon, record key icon, key recording icon
- **Selected Key** `[Type: display]`
  - Aliases: selected key display, captured key display

### Section: MACROS PANEL
- **Macros Panel** `[Type: panel]`
  - Aliases: macros panel container, macros configuration panel
- **Add Macro** `[Type: button]`
  - Aliases: add macro button, + add macro
- **Macro Name** `[Type: input]`
  - Aliases: macro name field

### Section: VARIABLES PANEL
- **Variables Panel** `[Type: panel]`
  - Aliases: variables panel container, variables configuration panel
- **+ add variable** `[Type: button]`
  - Aliases: add variable button, add normal variable, +add variable
- **+ add AB-alternator** `[Type: button]`
  - Aliases: add ab-alternator button, add ab alternator, +add ab-alternator
- **Variable Name** `[Type: input]`
  - Aliases: variable name field, name field
- **Variable Description** `[Type: input]`
  - Aliases: variable description field, description field
- **Default Value** `[Type: input]`
  - Aliases: default value field, value a field
- **B-value** `[Type: input]`
  - Aliases: b-value field, alternator b value, value b field
- **Normal Variable Icon** `[Type: icon]`
  - Aliases: x icon, (x) icon, variable x indicator
- **AB-alternator Icon** `[Type: icon]`
  - Aliases: alternator icon, ⇄ icon, swap icon

### Section: RUNDOWN EVENTS PANEL
- **Rundown Events Panel** `[Type: panel]`
  - Aliases: rundown events panel container, rundown events configuration

### Section: PROJECT SETTINGS
- **Project Settings** `[Type: panel]`
  - Aliases: project settings panel, automator project settings
- **Block Filter** `[Type: panel]`
  - Aliases: block filter setting, block type filter
- **Title Field** `[Type: dropdown]`
  - Aliases: title field selector, title field dropdown
- **Subtitle Field** `[Type: dropdown]`
  - Aliases: subtitle field selector, subtitle field dropdown
- **Trigger Layout** `[Type: dropdown]`
  - Aliases: trigger layout selector, trigger layout dropdown
- **Wider** `[Type: menu_item]`
  - Aliases: wider layout option, wider trigger layout
- **Regular** `[Type: menu_item]`
  - Aliases: regular layout option, regular trigger layout

### Section: DEVICES PANEL
- **Devices Panel** `[Type: panel]`
  - Aliases: devices panel container, devices configuration
- **Add device** `[Type: button]`
  - Aliases: add device button, + add device
- **Device type** `[Type: dropdown]`
  - Aliases: device type dropdown, device type selector
- **Device name** `[Type: input]`
  - Aliases: device name field, device name input
- **Enable/Disable** `[Type: toggle]`
  - Aliases: enable disable toggle, device enable toggle
- **Hostname** `[Type: input]`
  - Aliases: hostname field, host field, ip address field
- **HTTP Port** `[Type: input]`
  - Aliases: http port field, http port input
- **TCP Port** `[Type: input]`
  - Aliases: tcp port field, tcp port input
- **WebSocket Port** `[Type: input]`
  - Aliases: websocket port field, ws port field
- **Telnet Port** `[Type: input]`
  - Aliases: telnet port field
- **Socket Port** `[Type: input]`
  - Aliases: socket port field
- **Port** `[Type: input]`
  - Aliases: port field, port input
- **Token** `[Type: input]`
  - Aliases: token field, auth token field
- **Password** `[Type: input]`
  - Aliases: password field
- **App Token** `[Type: input]`
  - Aliases: app token field
- **Graphics Token** `[Type: input]`
  - Aliases: graphics token field
- **Client ID** `[Type: input]`
  - Aliases: client id field
- **API Key** `[Type: input]`
  - Aliases: api key field
- **URL** `[Type: input]`
  - Aliases: url field
- **Method** `[Type: dropdown]`
  - Aliases: method dropdown, http method dropdown
- **Headers** `[Type: input]`
  - Aliases: headers field, http headers field
- **Body** `[Type: input]`
  - Aliases: body field, request body field
- **Playlist Name** `[Type: input]`
  - Aliases: playlist name field
- **Project Path** `[Type: input]`
  - Aliases: project path field, nbtlproj path field
- **Telnet Control** `[Type: checkbox]`
  - Aliases: telnet control checkbox, enable telnet control
- **Handles media** `[Type: checkbox]`
  - Aliases: handles media checkbox
- **Download folder** `[Type: input]`
  - Aliases: download folder field, download folder path
- **Device media folder** `[Type: input]`
  - Aliases: device media folder field, device media folder path
- **Keep original filenames** `[Type: checkbox]`
  - Aliases: keep original filenames checkbox
- **Automatically delete files** `[Type: dropdown]`
  - Aliases: automatically delete files dropdown, auto-delete files
- **24 hours** `[Type: menu_item]`
  - Aliases: 24 hours option
- **1 week** `[Type: menu_item]`
  - Aliases: 1 week option
- **Add media field** `[Type: button]`
  - Aliases: add media field button, + add media field
- **Block Configuration** `[Type: dropdown]`
  - Aliases: block configuration dropdown, block template dropdown
- **Field Name** `[Type: dropdown]`
  - Aliases: field name dropdown
- **vMix** `[Type: device_type]`
  - Aliases: vmix device
- **OBS** `[Type: device_type]`
  - Aliases: obs studio device, obs device
- **TriCaster** `[Type: device_type]`
  - Aliases: tricaster vizrt, vizrt tricaster, newtek tricaster, tricaster device
- **Blackmagic ATEM** `[Type: device_type]`
  - Aliases: atem device, atem switcher
- **EVS Dyvi** `[Type: device_type]`
  - Aliases: dyvi device
- **Grass Valley AMPP** `[Type: device_type]`
  - Aliases: ampp device, grass valley ampp device
- **Grass Valley Kahuna** `[Type: device_type]`
  - Aliases: kahuna device
- **NetOn.live** `[Type: device_type]`
  - Aliases: neton live device
- **EVS XT** `[Type: device_type]`
  - Aliases: evs xt device
- **EVS XS-NEO** `[Type: device_type]`
  - Aliases: xs neo device, evs xs neo
- **AVID FastServe** `[Type: device_type]`
  - Aliases: fastserve device, avid fastserve device
- **CasparCG** `[Type: device_type]`
  - Aliases: caspar cg, casparcg device
- **Softron OnTheAir Video** `[Type: device_type]`
  - Aliases: softron device, ontheair video
- **Metus Playout** `[Type: device_type]`
  - Aliases: metus device
- **Imagine Communications Nexio AMP** `[Type: device_type]`
  - Aliases: nexio amp, imagine nexio
- **SingularLive** `[Type: device_type]`
  - Aliases: singular live, singular.live, singular.live device
- **UNO** `[Type: device_type]`
  - Aliases: uno singular live, uno by singular.live, uno (by singular.live), uno device
- **Viz Flowics** `[Type: device_type]`
  - Aliases: flowics device
- **Vizrt** `[Type: device_type]`
  - Aliases: viz device, vizrt graphics
- **Chyron PRIME** `[Type: device_type]`
  - Aliases: chyron-prime, chyron prime device, chyron device
- **NewBlue** `[Type: device_type]`
  - Aliases: newblue device
- **XPression** `[Type: device_type]`
  - Aliases: ross xpression, xpression device
- **SPX Graphics** `[Type: device_type]`
  - Aliases: spx, spx graphics device, spx device, spx graphics controller
- **MXMZ Graphics** `[Type: device_type]`
  - Aliases: mxmz device, mxmz graphics device
- **Resolume** `[Type: device_type]`
  - Aliases: resolume avenue, resolume arena, resolume arena media server, resolume device
- **Panasonic PTZ** `[Type: device_type]`
  - Aliases: panasonic, panasonic camera
- **Sony (VISCA)** `[Type: device_type]`
  - Aliases: sony ptz, sony visca camera
- **Polecam** `[Type: device_type]`
  - Aliases: polecam device
- **SHOTOKU** `[Type: device_type]`
  - Aliases: shotoku device
- **Mo-Sys** `[Type: device_type]`
  - Aliases: mosys device, mo sys device
- **Edelkrone** `[Type: device_type]`
  - Aliases: edelkrone device
- **Yamaha (SCP/RCP)** `[Type: device_type]`
  - Aliases: yamaha scp, yamaha rcp, yamaha device
- **On-Hertz Artisto** `[Type: device_type]`
  - Aliases: on hertz artisto, artisto device
- **Calrec** `[Type: device_type]`
  - Aliases: calrec audio, calrec mixing console, calrec device
- **Blackmagic Hyperdeck** `[Type: device_type]`
  - Aliases: hyperdeck device
- **Blackmagic Videohub** `[Type: device_type]`
  - Aliases: videohub device
- **Elgato Stream Deck** `[Type: device_type]`
  - Aliases: stream deck, stream deck device, elgato streamdeck
- **SKAARHOJ** `[Type: device_type]`
  - Aliases: skaarhoj device
- **Bitfocus Companion** `[Type: device_type]`
  - Aliases: companion, companion device, bitfocus companion device
- **Ember+** `[Type: device_type]`
  - Aliases: ember plus, lawo ember, ember+ device
- **OSC** `[Type: device_type]`
  - Aliases: open sound control, osc device
- **MIDI** `[Type: device_type]`
  - Aliases: midi device
- **VISCA** `[Type: device_type]`
  - Aliases: visca device, visca protocol
- **Webhook** `[Type: device_type]`
  - Aliases: webhook device, generic http webhook
- **MOS** `[Type: device_type]`
  - Aliases: mos protocol, mos device, media object server
- **RossTalk** `[Type: device_type]`
  - Aliases: ross talk, rosstalk device
- **System** `[Type: device_type]`
  - Aliases: system virtual device, built-in system device
- **Macro** `[Type: device_type]`
  - Aliases: macro virtual device
- **Cuez Media Player** `[Type: device_type]`
  - Aliases: cmp device, cuez media player virtual device
- **Ateliere Creative Technologies** `[Type: device_type]`
  - Aliases: ateliere, ateliere device, ateliere creative
- **Limecraft** `[Type: device_type]`
  - Aliases: limecraft device
- **EVS VIA MAP** `[Type: device_type]`
  - Aliases: via map device, evs viamap

### Section: FUNCTIONS
- **Play** `[Type: function]`
  - Aliases: play function, play action
- **Pause** `[Type: function]`
  - Aliases: pause function, pause action
- **Resume** `[Type: function]`
  - Aliases: resume function, resume action
- **Stop** `[Type: function]`
  - Aliases: stop function, stop action
- **Load Media** `[Type: function]`
  - Aliases: load media function, load clip
- **Load Template** `[Type: function]`
  - Aliases: load template function, load graphic template
- **Clear Layer** `[Type: function]`
  - Aliases: clear layer function
- **Clear** `[Type: function]`
  - Aliases: clear function, clear action
- **Set Opacity** `[Type: function]`
  - Aliases: set opacity function, opacity action
- **Set Volume** `[Type: function]`
  - Aliases: set volume function, volume action
- **Timecode** `[Type: function]`
  - Aliases: timecode function, timecode action
- **System.Next** `[Type: function]`
  - Aliases: system next, next system function
- **System.Next Card** `[Type: function]`
  - Aliases: system next card, next card function
- **System.Previous** `[Type: function]`
  - Aliases: system previous, previous system function
- **System.Previous Card** `[Type: function]`
  - Aliases: system previous card, previous card function
- **First Trigger** `[Type: function]`
  - Aliases: first trigger function
- **Toggle Variable** `[Type: function]`
  - Aliases: toggle variable function, system toggle variable, ab alternator toggle
- **Set Variable** `[Type: function]`
  - Aliases: set variable function, system set variable

### Section: AUTOMATOR LOCAL API BROWSER
- **Automator API Browser** `[Type: panel]`
  - Aliases: automator local api browser, localhost:7070/api/, api explorer
- **Pretty print** `[Type: checkbox]`
  - Aliases: pretty print checkbox, pretty json toggle

### Section: CUEZ MEDIA PLAYER
- **Cuez Media Player** `[Type: container]`
  - Aliases: cmp window, cuez media player window, cmp playout window
- **Channel** `[Type: dropdown]`
  - Aliases: channel selector, cmp channel selector, playout channel
- **Output URL** `[Type: display]`
  - Aliases: output url display, playout url

### Section: AUTOMATOR SATELLITE
- **Satellite Pairing Setup** `[Type: modal]`
  - Aliases: satellite first run setup, satellite pairing

## Application: CUEZ RUNDOWN

### Section: STRUCTURAL CONTAINERS
- **Episode Editor** `[Type: container]`
  - Aliases: editor view, main editor
- **Top Toolbar** `[Type: container]`
  - Aliases: toolbar
- **Sidebar** `[Type: container]`
  - Aliases: left sidebar
- **Dashboard** `[Type: container]`
  - Aliases: project overview, project home
- **Main Screen** `[Type: container]`
- **Organisation Page** `[Type: container]`
  - Aliases: organization page
- **Support Chat Panel** `[Type: panel]`
  - Aliases: support widget, intercom panel

### Section: GLOBAL CHROME
- **Project Switcher** `[Type: dropdown]`
  - Aliases: project dropdown
- **Projects Menu** `[Type: dropdown]`
  - Aliases: projects, projects dropdown, projects button, organisation menu, org menu
- **My Account** `[Type: button]`
  - Aliases: my account button, account button, profile button
- **User Menu** `[Type: dropdown]`
  - Aliases: account dropdown menu, user dropdown menu
- **Appearance** `[Type: toggle]`
  - Aliases: appearance toggle, theme toggle
- **Light Mode** `[Type: menu_item]`
- **Dark Mode** `[Type: menu_item]`
- **System Appearance** `[Type: menu_item]`
  - Aliases: follow system
- **Help** `[Type: button]`
  - Aliases: help button, question mark button, ? button
- **Support Chat Icon** `[Type: icon]`
  - Aliases: blue message icon, chat widget icon, intercom button
- **Help Article Modal** `[Type: modal]`
  - Aliases: help article, intercom help article modal
- **Close** `[Type: button]`
  - Aliases: close button, x icon, close icon, dismiss button
- **Loading** `[Type: indicator]`
  - Aliases: loading indicator, loading spinner, spinner, loading screen

### Section: ACCOUNT MENU
- **Profile Picture** `[Type: input]`
  - Aliases: profile picture upload, avatar upload
- **Full Name** `[Type: input]`
  - Aliases: full name field
- **Email Address** `[Type: input]`
  - Aliases: email address field
- **Password** `[Type: input]`
  - Aliases: password field
- **Confirmation Code** `[Type: input]`
  - Aliases: confirmation code input, confirmation code field, 6-digit code, verification code
- **Locked Account** `[Type: state]`
  - Aliases: locked, account locked, account locked state

### Section: ORGANISATION SETTINGS
- **Organisation Settings** `[Type: menu_item]`
  - Aliases: organization settings, organisation settings & billing, organization settings & billing
- **Organisation Settings** `[Type: tab]`
  - Aliases: organization settings tab, organisation settings tab
- **Organisation Members** `[Type: tab]`
  - Aliases: organization members tab, organization members
- **Payment Method** `[Type: panel]`
- **Add Payment Method** `[Type: button]`
  - Aliases: add payment method button
- **Invoices** `[Type: panel]`
- **Manage Organisation Members** `[Type: button]`
  - Aliases: organisation manage members
- **Media Library** `[Type: panel]`
- **Add Media Library** `[Type: button]`
  - Aliases: add media library button
- **Library Name** `[Type: input]`
  - Aliases: library name field
- **Library Type** `[Type: dropdown]`
  - Aliases: library type dropdown
- **Owner** `[Type: role]`
  - Aliases: organisation owner, org owner
- **Member** `[Type: role]`
  - Aliases: organisation member, org member

### Section: DASHBOARD ELEMENTS
- **Search** `[Type: input]`
  - Aliases: search bar, episode search bar, search field
- **Sorting Filters** `[Type: dropdown]`
  - Aliases: sort dropdown
- **Sort by Episode Name** `[Type: menu_item]`
- **Sort by Scheduled Date** `[Type: menu_item]`
- **Sort by Date Created** `[Type: menu_item]`
- **Create Project** `[Type: button]`
  - Aliases: create project button, new project button
- **Create new episode** `[Type: button]`
  - Aliases: create new episode button, new episode button
- **Upgrade** `[Type: button]`
  - Aliases: upgrade button, upgrade plan button
- **Manage Members** `[Type: button]`
  - Aliases: manage members button, manage project members
- **Invite Members to Project** `[Type: button]`
  - Aliases: invite members to project button, invite button
- **User Row 3-Dots Menu** `[Type: icon]`
  - Aliases: user row actions menu
- **Project Actions Menu** `[Type: icon]`
  - Aliases: project 3-dots menu
- **Project Properties** `[Type: menu_item]`
  - Aliases: project properties menu item
- **Change Role** `[Type: menu_item]`
- **Reset Password** `[Type: menu_item]`
- **Remove from Project** `[Type: menu_item]`
- **Confirmation Toast** `[Type: indicator]`
  - Aliases: toast notification
- **Episode Row** `[Type: list_item]`
  - Aliases: episode list item
- **More Actions** `[Type: button]`
  - Aliases: more actions button, episode row 3-dots, row 3-dots menu
- **Template Edit Indicator** `[Type: indicator]`
  - Aliases: yellow header indicator
- **Permanently Delete** `[Type: button]`
  - Aliases: permanently delete button
- **Automator** `[Type: button]`
  - Aliases: automator button, pair automator button, pair automator, pair button
- **Automator Pairing Screen** `[Type: panel]`
  - Aliases: automator pairing, available connections screen, pair automator screen
- **Active Episodes** `[Type: folder]`
  - Aliases: active episodes folder, episodes folder
- **Archive** `[Type: folder]`
  - Aliases: archive folder, archived folder
- **Deleted** `[Type: folder]`
  - Aliases: deleted folder
- **Templates** `[Type: folder]`
  - Aliases: templates folder
- **Series** `[Type: folder]`
  - Aliases: series folder
- **Create Template from Episode** `[Type: menu_item]`
- **Duplicate Episode** `[Type: menu_item]`
- **Archive Episode** `[Type: menu_item]`
- **Delete Episode** `[Type: menu_item]`
- **Unarchive Episode** `[Type: menu_item]`
- **Restore Episode** `[Type: menu_item]`
- **Duplicate Episode Template** `[Type: menu_item]`
- **Delete Episode Template** `[Type: menu_item]`
- **Edit Series** `[Type: menu_item]`
- **Archive Series** `[Type: menu_item]`
- **Delete Series** `[Type: menu_item]`
- **Sports Project Template** `[Type: menu_item]`
  - Aliases: sports template, sports starter
- **Talkshow Project Template** `[Type: menu_item]`
  - Aliases: talkshow template
- **Esports Project Template** `[Type: menu_item]`
  - Aliases: esports template
- **Live Event Project Template** `[Type: menu_item]`
  - Aliases: live event template
- **News Project Template** `[Type: menu_item]`
  - Aliases: news template
- **Educational Project Template** `[Type: menu_item]`
  - Aliases: educational template
- **Admin** `[Type: role]`
  - Aliases: project admin
- **Contributor** `[Type: role]`
  - Aliases: project contributor

### Section: CONTENT HIERARCHY
- **Organisation** `[Type: reference]`
  - Aliases: organization
- **Project** `[Type: reference]`
- **Series** `[Type: reference]`
- **Episode** `[Type: reference]`
  - Aliases: show
- **Part** `[Type: reference]`
  - Aliases: segment, section
- **Item** `[Type: reference]`
  - Aliases: rundown row item
- **Block** `[Type: reference]`
  - Aliases: block instance
- **Text Block** `[Type: reference]`
- **Cue Block** `[Type: reference]`
- **Heading** `[Type: reference]`
  - Aliases: headings, parts and items
- **Badge** `[Type: reference]`
  - Aliases: block badge name
- **Action Menu** `[Type: reference]`
  - Aliases: 3 vertical dots menu, three dots menu

### Section: EPISODE EDITOR TOOLBAR
- **Episode Name** `[Type: input]`
  - Aliases: episode name field, episode title field
- **Back** `[Type: button]`
  - Aliases: back button, back arrow
- **Episode Layout** `[Type: dropdown]`
  - Aliases: layout, layout dropdown, display layout dropdown, display layout menu, layout selector, layout: rundown, layout: script, layout: tablet
- **Rundown only** `[Type: menu_item]`
  - Aliases: rundown layout, rundown view toggle, rundown only layout
- **Script only** `[Type: menu_item]`
  - Aliases: script layout, script view toggle, script only layout
- **Rundown & Script** `[Type: menu_item]`
  - Aliases: side-by-side layout toggle, side-by-side layout, side-by-side, side by side layout, hybrid layout, rundown and script
- **Live Show Type** `[Type: toggle]`
  - Aliases: live show type toggle, live toggle, live
- **Recorded Show Type** `[Type: toggle]`
  - Aliases: recorded show type toggle, recorded toggle, recorded
- **On Air Time** `[Type: input]`
  - Aliases: on air time field
- **Off Air Time** `[Type: input]`
  - Aliases: off air time field
- **Cue Mode** `[Type: switch]`
  - Aliases: cue mode switch, cue toggle
- **Column Manager Plus** `[Type: button]`
  - Aliases: column manager plus button, column visibility toggle, show/hide columns button
- **Add a New Column** `[Type: button]`
  - Aliases: add a new column button, create column button
- **Block Filter Eye** `[Type: icon]`
  - Aliases: block filter eye icon, filter icon, eye icon
- **Block Configuration Filter Menu** `[Type: panel]`
  - Aliases: block visibility filter, filter columns menu
- **Block Filter Search** `[Type: input]`
  - Aliases: block filter search field
- **Deselect All** `[Type: button]`
  - Aliases: deselect all button
- **Select all** `[Type: button]`
  - Aliases: select all button
- **Over/Under Duration** `[Type: display]`
  - Aliases: over/under duration display, over under timer, toolbar over under display
- **Episode Time** `[Type: display]`
  - Aliases: episode time display, current time display
- **Search** `[Type: icon]`
  - Aliases: search icon, magnifying glass icon
- **Prompter** `[Type: button]`
  - Aliases: prompter button, prompter top toolbar button
- **Share** `[Type: button]`
  - Aliases: share button, top toolbar share button
- **Collapse Rundown** `[Type: button]`
  - Aliases: collapse rundown button, hide rundown button
- **Expand Rundown** `[Type: button]`
  - Aliases: expand rundown button, show rundown button
- **Center Divider** `[Type: slider]`
  - Aliases: panel divider, rundown script divider, view separator
- **Follow Cue** `[Type: toggle]`
  - Aliases: follow cue toggle, follow the cuer toggle

### Section: SEARCH PANEL
- **Search** `[Type: panel]`
  - Aliases: search panel
- **Search Input** `[Type: input]`
  - Aliases: search input field
- **Search Scope** `[Type: dropdown]`
  - Aliases: search scope dropdown
- **This Episode** `[Type: scope]`
  - Aliases: this episode scope
- **This Project** `[Type: scope]`
  - Aliases: this project scope
- **All Projects** `[Type: scope]`
  - Aliases: all projects scope
- **Find and Replace Mode** `[Type: panel]`
- **Global Search** `[Type: panel]`

### Section: EPISODE ACTION MENU
- **Episode Action Menu** `[Type: icon]`
  - Aliases: episode 3-dots menu, episode three dots menu, more actions menu
- **Print** `[Type: menu_item]`
- **Share Public Link** `[Type: menu_item]`
  - Aliases: share menu item
- **Copy Link** `[Type: menu_item]`
- **Duplicate Episode** `[Type: menu_item]`
- **Create Template from Episode** `[Type: menu_item]`
- **Open Trash** `[Type: menu_item]`
  - Aliases: trash, trash menu item
- **Find and Replace** `[Type: menu_item]`
- **Freeze Item and Block Number** `[Type: menu_item]`
  - Aliases: freeze numbers
- **Block & Columns Configuration** `[Type: menu_item]`
  - Aliases: block and columns configuration menu item
- **Episode Settings** `[Type: menu_item]`
- **Share Public Link Popup** `[Type: modal]`
- **Public Access** `[Type: toggle]`
  - Aliases: public access toggle
- **Shareable URL** `[Type: input]`
  - Aliases: shareable url field
- **Public Link Shared View** `[Type: view]`
  - Aliases: external shared view, read-only shared view
- **Shared View Layout** `[Type: dropdown]`
  - Aliases: shared view layout dropdown, public view layout dropdown
- **Tablet Layout** `[Type: menu_item]`
  - Aliases: tablet
- **Shared View Previous Item** `[Type: button]`
  - Aliases: previous item button, previous item
- **Shared View Next Item** `[Type: button]`
  - Aliases: next item button
- **Timezone** `[Type: dropdown]`
  - Aliases: timezone dropdown
- **Time Format** `[Type: toggle]`
  - Aliases: time format toggle
- **12-hour Time Format** `[Type: menu_item]`
- **24-hour Time Format** `[Type: menu_item]`
- **Scheduled Date** `[Type: picker]`
  - Aliases: scheduled date picker

### Section: CONTENT STRUCTURE
- **Part Row** `[Type: row]`
  - Aliases: part header
- **Item Row** `[Type: row]`
- **Block Row** `[Type: row]`
- **Add Content +** `[Type: button]`
  - Aliases: add content button, add content + button, inline plus button, hover plus button
- **Add Content Menu** `[Type: panel]`
- **Add Block Menu** `[Type: panel]`
  - Aliases: bottom add block bar
- **+ Add block** `[Type: button]`
  - Aliases: add block button, add block
- **Drag Handle** `[Type: icon]`
  - Aliases: 6 dots handle, six dots handle, grab handle
- **Drag Drop Indicator** `[Type: indicator]`
  - Aliases: blue line indicator, drop position line
- **Manage Block Templates** `[Type: link]`
  - Aliases: manage block templates link, manage block configurations link
- **Expand All Items** `[Type: button]`
  - Aliases: expand all items button
- **Collapse All Items** `[Type: button]`
  - Aliases: collapse all items button
- **Expand Item** `[Type: button]`
  - Aliases: expand item button, item expand caret, item expand toggle
- **Colour Swatch** `[Type: swatch]`
  - Aliases: color swatch
- **Element Action Menu** `[Type: icon]`
  - Aliases: 6-dots menu, drag handle menu
- **Go to Script** `[Type: menu_item]`
- **Go to Rundown** `[Type: menu_item]`
- **Open Details** `[Type: menu_item]`
- **Duplicate** `[Type: menu_item]`
- **Delete** `[Type: menu_item]`
- **Item Colour** `[Type: menu_item]`
  - Aliases: item color
- **Item Colour** `[Type: picker]`
  - Aliases: item colour picker, item color picker
- **Add Comment** `[Type: menu_item]`
- **Float** `[Type: menu_item]`
- **Unfloat** `[Type: menu_item]`
- **Copy** `[Type: menu_item]`
- **Paste Clipboard** `[Type: menu_item]`
- **Text Markup Menu** `[Type: panel]`
  - Aliases: inline formatting toolbar
- **Bold** `[Type: button]`
  - Aliases: bold button
- **Italic** `[Type: button]`
  - Aliases: italic button
- **Underline** `[Type: button]`
  - Aliases: underline button
- **Strikethrough** `[Type: button]`
  - Aliases: strikethrough button
- **Text Colour** `[Type: picker]`
  - Aliases: text colour picker, text color picker
- **Background Colour** `[Type: picker]`
  - Aliases: background colour picker, background color picker, highlight colour picker, highlight color picker
- **Trash** `[Type: panel]`
  - Aliases: trash panel, episode trash panel, deleted content panel
- **Floated** `[Type: state]`
  - Aliases: floated state, greyed out state, diagonal lines state
- **Frozen Numbers** `[Type: state]`
  - Aliases: frozen numbers state
- **Item Badge Number** `[Type: badge]`
- **Item Index Number** `[Type: badge]`
- **Cue Block Index Number** `[Type: badge]`
- **Comment Thread** `[Type: panel]`
  - Aliases: comment thread panel, new comment dialog
- **New Comment** `[Type: input]`
  - Aliases: new comment field, comment input field
- **Send** `[Type: button]`
  - Aliases: send button, paper airplane button
- **Resolve Comment** `[Type: menu_item]`
- **Item History** `[Type: panel]`
  - Aliases: item history panel, item revisions panel

### Section: BLOCK SYSTEM
- **Text Block Badge** `[Type: badge]`
  - Aliases: T badge
- **Cue Block Badge** `[Type: badge]`
  - Aliases: CUE badge
- **Side Panel View** `[Type: panel]`
  - Aliases: side panel details, block details panel, cue block detail panel
- **Prompter (Text Block)** `[Type: menu_item]`
  - Aliases: PROMPTER, prompter block, prompter text block
- **Presenter Tablet (Text Block)** `[Type: menu_item]`
- **Live (Text Block)** `[Type: menu_item]`
- **OOV (Text Block)** `[Type: menu_item]`
- **Cams (Text Block)** `[Type: menu_item]`
- **Instructions (Text Block)** `[Type: menu_item]`
  - Aliases: INSTRUCTION, INSTRUCTIONS, instructions block
- **Reporter (Text Block)** `[Type: menu_item]`
- **Host 1 (Text Block)** `[Type: menu_item]`
- **Host 2 (Text Block)** `[Type: menu_item]`
- **Guest (Text Block)** `[Type: menu_item]`
- **Presenter 1 (Text Block)** `[Type: menu_item]`
- **Presenter 2 (Text Block)** `[Type: menu_item]`
- **Stage Instruction (Text Block)** `[Type: menu_item]`
  - Aliases: STAGE INSTRUCTION, stage instruction block
- **Talk (Text Block)** `[Type: menu_item]`
- **Q&A (Text Block)** `[Type: menu_item]`
- **Item (Text Block)** `[Type: menu_item]`
- **Talent (Text Block)** `[Type: menu_item]`
- **Clip (Cue Block)** `[Type: menu_item]`
  - Aliases: CLIP, clip block
- **Graphic (Cue Block)** `[Type: menu_item]`
  - Aliases: GRAPHIC, graphic block
- **Camera (Cue Block)** `[Type: menu_item]`
- **Audio (Cue Block)** `[Type: menu_item]`
- **Strap (Cue Block)** `[Type: menu_item]`
  - Aliases: lowerthird cue block, lower third cue block
- **Break (Cue Block)** `[Type: menu_item]`
- **Match (Cue Block)** `[Type: menu_item]`
- **Off Air (Cue Block)** `[Type: menu_item]`
- **Guest Show (Cue Block)** `[Type: menu_item]`
- **Sponsor (Cue Block)** `[Type: menu_item]`
- **Commercial (Cue Block)** `[Type: menu_item]`
- **Call (Cue Block)** `[Type: menu_item]`
- **Slide (Cue Block)** `[Type: menu_item]`
- **Game (Cue Block)** `[Type: menu_item]`
- **ON/OFF (Cue Block)** `[Type: menu_item]`
- **Interview (Cue Block)** `[Type: menu_item]`
- **Block Configurations Manager** `[Type: modal]`
  - Aliases: manage block configurations, block templates manager, block templates modal
- **Active** `[Type: tab]`
  - Aliases: active tab
- **Archived** `[Type: tab]`
  - Aliases: archived tab
- **+ Create Block Template** `[Type: button]`
  - Aliases: create block configuration button, create block template button, + create block configuration
- **Configuration Actions Menu** `[Type: icon]`
  - Aliases: block template actions menu, template 3-dots menu
- **Edit Block Template** `[Type: menu_item]`
  - Aliases: edit configuration, edit template
- **Duplicate Block Template** `[Type: menu_item]`
  - Aliases: duplicate configuration
- **Archive Block Template** `[Type: menu_item]`
  - Aliases: archive configuration
- **Unarchive Block Template** `[Type: menu_item]`
  - Aliases: unarchive configuration
- **Edit Block Template View** `[Type: modal]`
  - Aliases: edit block template modal, block template editor, edit configuration modal
- **Edit Block Template Name** `[Type: icon]`
  - Aliases: block template name pencil icon, edit name pencil
- **Block Template Name** `[Type: input]`
  - Aliases: configuration name field, block template name field
- **Block Type** `[Type: dropdown]`
  - Aliases: block type selector
- **Block Colour** `[Type: picker]`
  - Aliases: block colour picker, block color picker
- **Show Badge on Script** `[Type: checkbox]`
  - Aliases: show badge on script toggle
- **Show Background Colour** `[Type: checkbox]`
  - Aliases: show background color toggle, show background colour toggle
- **Fields List** `[Type: panel]`
  - Aliases: fields panel, block template fields list
- **Field Row** `[Type: row]`
  - Aliases: field list item, block template field row
- **+ Add Field** `[Type: button]`
  - Aliases: add field button, + add field button
- **Field Actions Menu** `[Type: icon]`
  - Aliases: field 3-dots menu
- **Edit Field** `[Type: menu_item]`
  - Aliases: edit field menu item
- **Delete field** `[Type: menu_item]`
  - Aliases: delete field menu item
- **Field Visibility Toggle** `[Type: icon]`
  - Aliases: field visibility eye icon, field eye icon, hide field icon
- **Edit Field** `[Type: modal]`
  - Aliases: edit field modal, field configuration modal, add plain text field, add text area field, edit text area column
- **Field Name** `[Type: input]`
  - Aliases: field name input
- **Text Transform** `[Type: dropdown]`
  - Aliases: aa, aa dropdown, case dropdown, text case selector, text transform dropdown
- **Aa Uppercase** `[Type: menu_item]`
  - Aliases: uppercase, aa uppercase option
- **Aa Lowercase** `[Type: menu_item]`
  - Aliases: lowercase, aa lowercase option
- **Aa Original** `[Type: menu_item]`
  - Aliases: original case, aa original option, no transform
- **+ Add New Option** `[Type: button]`
  - Aliases: add new option, add new option button, + add new option button, add label option button
- **Customize Option Popover** `[Type: panel]`
  - Aliases: customise option popover, label option customizer
- **Option Name** `[Type: input]`
  - Aliases: option name input, label option name field
- **Save** `[Type: button]`
  - Aliases: save button
- **Cancel** `[Type: button]`
  - Aliases: cancel button
- **Add field** `[Type: button]`
  - Aliases: add field confirm button, add field submit
- **Create block template modal** `[Type: modal]`
  - Aliases: create block template, create block configuration modal, new block template modal
- **Create block** `[Type: button]`
  - Aliases: create block button, create block submit
- **Title Field** `[Type: menu_item]`
- **Plain Text Field** `[Type: menu_item]`
- **Text Area Field** `[Type: menu_item]`
- **Label Field** `[Type: menu_item]`
  - Aliases: dropdown field, select field
- **Media Field** `[Type: menu_item]`
- **Default Field Style** `[Type: panel]`
- **Default Field Value** `[Type: input]`
- **Set Field as Required** `[Type: checkbox]`
  - Aliases: set field as required toggle
- **Display Field in a Separate Row** `[Type: checkbox]`
  - Aliases: display field in a separate row checkbox, always display field in a separate row
- **Character Limit** `[Type: checkbox]`
  - Aliases: character limit toggle
- **Maximum Characters** `[Type: input]`
  - Aliases: maximum characters field
- **Character Counter** `[Type: indicator]`
- **Include in Timings** `[Type: checkbox]`
  - Aliases: include in timings toggle, include content in timings
- **Read Speed** `[Type: input]`
  - Aliases: read speed field
- **Single-select** `[Type: toggle]`
  - Aliases: single-select toggle
- **Multi-select** `[Type: toggle]`
  - Aliases: multi-select toggle
- **Label Options List** `[Type: panel]`
- **Media Type** `[Type: dropdown]`
  - Aliases: media type selector
- **Video Media Type** `[Type: menu_item]`
- **Image Media Type** `[Type: menu_item]`
- **Audio Media Type** `[Type: menu_item]`
- **Display Format** `[Type: input]`
  - Aliases: display format field
- **Width** `[Type: input]`
  - Aliases: width field
- **Height** `[Type: input]`
  - Aliases: height field
- **Upload or Select File** `[Type: icon]`
  - Aliases: upload or select file icon, media upload icon, media field upload icon
- **Add Video** `[Type: button]`
  - Aliases: add video button
- **Add Image** `[Type: button]`
  - Aliases: add image button
- **Add Audio** `[Type: button]`
  - Aliases: add audio button
- **Media Library Browser** `[Type: modal]`
- **Upload to Cuez** `[Type: tab]`
  - Aliases: upload to cuez tab
- **Media Thumbnail** `[Type: icon]`
- **Media Download Checkmark** `[Type: indicator]`
  - Aliases: green checkmark

### Section: COLUMNS
- **Timing Column** `[Type: reference]`
- **Text Column** `[Type: reference]`
- **Label Column** `[Type: reference]`
- **Cue Column** `[Type: reference]`
  - Aliases: cue, cue column option
- **Column Header** `[Type: row]`
  - Aliases: draggable column header
- **Column Resizer** `[Type: slider]`
  - Aliases: column resize handle, column drag handle
- **Column Cell** `[Type: input]`
  - Aliases: text column cell, label column cell, notes cell, column input cell
- **Timings** `[Type: menu_item]`
  - Aliases: timings submenu, timings menu item
- **Column Manager** `[Type: panel]`
- **Column Actions Menu** `[Type: icon]`
- **Edit Column** `[Type: menu_item]`
- **Archive Column** `[Type: menu_item]`
- **Delete Column** `[Type: menu_item]`
- **Unarchive Column** `[Type: menu_item]`
- **Column Visibility** `[Type: checkbox]`
  - Aliases: column visibility checkbox, column checkbox, show column checkbox
- **Column Name** `[Type: input]`
  - Aliases: column name field
- **Applies-to Level** `[Type: dropdown]`
  - Aliases: applies-to level selector
- **Default Cell Style** `[Type: panel]`
- **Default Cell Value** `[Type: input]`

### Section: VIEWS
- **Script View** `[Type: layout]`
- **Rundown View** `[Type: layout]`
- **Side-by-side View** `[Type: layout]`
- **Custom View** `[Type: layout]`
- **Public View** `[Type: layout]`

### Section: TIMINGS
- **Estimated Duration** `[Type: display]`
  - Aliases: est. duration, est duration
- **On Air Time** `[Type: display]`
- **Off Air Time** `[Type: display]`
- **Front Time** `[Type: display]`
- **Back Time** `[Type: display]`
- **Part Timer** `[Type: timer]`
- **Over/Under Duration** `[Type: display]`
- **Actual Duration** `[Type: display]`
- **Actual Start Time** `[Type: display]`
- **Actual End Time** `[Type: display]`
- **Read Speed** `[Type: display]`
- **Timing Reset** `[Type: icon]`
  - Aliases: timing reset icon
- **On Time Green** `[Type: colour_status]`
- **Under Time Orange** `[Type: colour_status]`
- **Over Time Red** `[Type: colour_status]`
- **Auto-calculated Black** `[Type: colour_status]`
- **Stale Grey** `[Type: colour_status]`
- **Manually Overwritten Blue** `[Type: colour_status]`
- **Needs Attention Red** `[Type: colour_status]`

### Section: CUEING ENGINE
- **Cue Overview Bar** `[Type: bar]`
  - Aliases: cue overview row, black overview bar
- **Cue Overview Left Half** `[Type: panel]`
  - Aliases: episode-level overview
- **Cue Overview Right Half** `[Type: panel]`
  - Aliases: active element overview
- **Total On Air** `[Type: counter]`
  - Aliases: total on air counter
- **Off Air Countdown** `[Type: countdown]`
- **Over/Under Timer** `[Type: timer]`
- **Element On Air** `[Type: counter]`
  - Aliases: element on air counter
- **Element End Countdown** `[Type: countdown]`
- **Cue Progress Bar** `[Type: bar]`
- **Currently Cued Element** `[Type: badge]`
  - Aliases: currently cued element badge, red pill badge, active element badge, current item badge
- **Next** `[Type: button]`
  - Aliases: next button
- **Play** `[Type: button]`
  - Aliases: play button, cue play button, cue button
- **On Cue** `[Type: state]`
  - Aliases: on cue state, cued state, red border state, active cue
- **Blur** `[Type: state]`
  - Aliases: blur state
- **Cue Reset** `[Type: button]`

### Section: PROMPTER
- **Cuez Prompter** `[Type: container]`
  - Aliases: prompter window, teleprompter
- **Prompter URL Dialog** `[Type: modal]`
- **Prompter Settings** `[Type: panel]`
  - Aliases: prompter settings panel
- **Prompter Settings Gear** `[Type: icon]`
  - Aliases: prompter settings gear icon
- **Font Size** `[Type: input]`
  - Aliases: font size control
- **Mirroring** `[Type: toggle]`
  - Aliases: mirroring toggle
- **Spacing** `[Type: input]`
  - Aliases: spacing control
- **Scroll Speed Preset** `[Type: input]`
  - Aliases: scroll speed control, scroll speed preset input, speed input, speed 1, speed 2, speed 3, speed 4, speed 5, numbered speed input
- **Aspect Ratio** `[Type: dropdown]`
  - Aliases: aspect ratio selector
- **Prompter Block Visibility Filter** `[Type: panel]`
  - Aliases: prompter block filter, prompter visibility filter
- **Share** `[Type: checkbox]`
  - Aliases: share checkbox, master/slave share toggle
- **Connected Clients List** `[Type: panel]`
- **Multiple Masters Warning** `[Type: indicator]`
  - Aliases: multiple masters warning indicator
- **Master Prompter Instance** `[Type: state]`
- **Slave Prompter Instance** `[Type: state]`

### Section: KEYBOARD SHORTCUTS
- **Open Search Panel Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+F, Ctrl+F
- **Find and Replace Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+Option+F, Ctrl+Alt+F
- **Global Search Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+K, Ctrl+K
- **Horizontal Scroll Shortcut** `[Type: shortcut]`
  - Aliases: Shift+scroll wheel
- **Zoom Out Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+minus, Ctrl+minus
- **Print Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+P, Ctrl+P
- **Focus First Field Shortcut** `[Type: shortcut]`
  - Aliases: Enter
- **Deselect Shortcut** `[Type: shortcut]`
  - Aliases: Esc, Escape
- **Navigate Between Elements Shortcut** `[Type: shortcut]`
  - Aliases: arrow keys
- **Move Element Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+up arrow, Cmd+down arrow, Ctrl+up arrow, Ctrl+down arrow
- **Extend Selection Shortcut** `[Type: shortcut]`
  - Aliases: Shift+up arrow, Shift+down arrow
- **Add Block Below Shortcut** `[Type: shortcut]`
  - Aliases: Alt+B, Option+B
- **Add Part Below Shortcut** `[Type: shortcut]`
  - Aliases: Alt+Shift+P, Option+Shift+P
- **Add Item Below Shortcut** `[Type: shortcut]`
  - Aliases: Alt+Shift+I, Option+Shift+I
- **Copy Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+C, Ctrl+C
- **Paste Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+V, Ctrl+V
- **Cut Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+X, Ctrl+X
- **Duplicate Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+D, Ctrl+D
- **Delete Shortcut** `[Type: shortcut]`
  - Aliases: Backspace, Delete key, Del
- **Float/Unfloat Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+Shift+F, Ctrl+Shift+F
- **Insert Timestamp Shortcut** `[Type: shortcut]`
  - Aliases: Alt+T, Option+T
- **Bold Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+B, Ctrl+B
- **Italic Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+I, Ctrl+I
- **Underline Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+U, Ctrl+U
- **Strikethrough Shortcut** `[Type: shortcut]`
  - Aliases: Cmd+Shift+X, Ctrl+Shift+X
- **Cue Next Element Shortcut** `[Type: shortcut]`
  - Aliases: Spacebar (cueing)
- **Prompter Start/Stop Scroll Shortcut** `[Type: shortcut]`
  - Aliases: Spacebar (prompter), B key
- **Prompter Return to Top Shortcut** `[Type: shortcut]`
  - Aliases: D key, S key
- **Prompter Part/Item Overview Shortcut** `[Type: shortcut]`
  - Aliases: L key
- **Prompter Block Navigation Shortcut** `[Type: shortcut]`
  - Aliases: arrow keys (prompter)
- **Prompter Black Screen Shortcut** `[Type: shortcut]`
  - Aliases: Esc (prompter), blackout shortcut

***
*Note: These lists are not exhaustive — if you see elements not on this list, name them using the exact on-screen label text.*
[END CONTEXT]


You are the session memory and quality controller for a video tutorial analysis pipeline. You maintain the authoritative, merged action and annotation log across all analyzed chunks.

VIDEO BEING ANALYZED: {video_title} ({video_url})
TOTAL DURATION: {total_duration}

ON EACH TURN you receive:
1. A chunk of newly extracted actions and annotations (JSON object)
2. The chunk's primary time window and overlap margins

YOUR RESPONSIBILITIES:
1. MERGE new actions and annotations into the running log. Deduplicate overlap items. If an item in the current chunk was already processed and returned in a previous chunk's "validated_segment_events" or "validated_segment_annotations", DO NOT include it again.
2. PRESERVE ASYNC SYSTEM EVENTS: Do NOT drop "ui_response" or "system_event" actions that represent delayed or asynchronous application behavior (e.g., a render completing, an export finishing, an error appearing after processing). If a system event merely restates what a nearby action's "result" field already describes, it may be removed as a duplicate.
3. PRESERVE IDs: You MUST keep the original "id" exactly as it was provided in the extracted actions. If you merge two items, keep the ID of the primary item.
4. NO INTERNAL REASONING: Do not include any internal reasoning, explanations, or conversational text inside the JSON values. Keep all string values concise and direct.

RESPOND with a JSON object:
{
  "chunk_processed": { "number": N, "primary_window": "MM:SS–MM:SS" },
  "new_actions_added": 5,
  "duplicates_removed": 1,
  "conflicts_resolved": ["Resolved timestamp overlap between evt_X and new action"],
  "current_ui_state": {
    "application": "software name",
    "active_file": "filename",
    "visible_panels": ["panels"],
    "active_tool": "mouse_pointer",
    "open_dialogs": ["dialogs"],
    "other_state": "other"
  },
  "cumulative_action_count": 42,
  "validated_segment_events": [
     // ONLY THE NEW, DEDUPLICATED ACTIONS FROM THIS CHUNK. Do NOT include actions from previous chunks.
     {
       "id": "evt_12345678",
       ... <standard action properties including target and input_data>
     }
  ],
  "validated_segment_annotations": [
     // ONLY THE NEW, DEDUPLICATED ANNOTATIONS FROM THIS CHUNK. Do NOT include annotations from previous chunks.
     {
       "id": "ann_12345678",
       "timestamp": "MM:SS",
       "annotation_type": "title_card",
       "content": "Text",
       "relevance": "Why it matters"
     }
  ],
  "merged_log_excerpt": [ <last few actions> ]
}


Process these raw visual actions and annotations for the timespan 01:00s-01:30s.

Raw Actions:
[
  {
    "id": "evt_1",
    "timestamp": "01:05",
    "action_type": "click",
    "target": {
      "element": "Menu"
    }
  }
]

Annotations:
[]

Extract the precise UI state updates and return the validated events array.