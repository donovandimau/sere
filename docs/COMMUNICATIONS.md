# Shared communications entry

`dimau-connect.js` and `dimau-connect.css` are byte copies of the canonical `communications/dimau-connect.js` in `donovandimau/dimau-platform-standard`. Update the master before syncing copies.

The optional Connect panel links to `https://sotakece.com/communications.html` with this app's public slug and a selected view. It uses no external scripts, iframes, authentication tokens, app records, telemetry, camera or microphone access. Links use `noopener noreferrer`. Sota Kece is for ages 16 and over, as shown before opening the hub. It handles its own authentication and existing group membership; this is a shared hub entry, not cross-domain single sign-on or a replacement for native app groups.

Chat, groups and task/discussion boards are provided by the hub. Calls open the external Jitsi service only after deliberate user action in the hub; the hub explains link-based access and host admission controls. No claim of self-hosted media or end-to-end calling verification is made by adding this launcher.

Checks for this integration: canonical source byte comparison, JavaScript syntax, exactly one launcher tag per changed entry and the actual public asset destination. Existing release holds apply. Remove the launcher tags and copied file to roll back this entry.
