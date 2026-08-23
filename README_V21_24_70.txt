World Drive V21.24.70 — Sonata upper red rear lamp restoration

Targeted regression fix from V21.24.69:
- keeps the working rear amber turn-signal mapping on Object_33 unchanged;
- restores the red authored-texture glow on Object_33, which is the red lamp section directly above the amber indicator;
- that restored upper red section now follows the same running/night and brake intensity logic as the other rear red lamp;
- reverse white and front authored lighting are unchanged;
- no physics, steering, wheel, terrain, or other vehicle changes.

Technical cause:
- V21.24.69 correctly moved the amber indicator to Object_33, but Object_33 also contains red rear-lamp pixels;
- only an amber glow layer was registered for Object_33, so its red pixels no longer received the running/brake emissive state;
- V21.24.70 adds the missing red-filter glow layer to Object_33 while leaving the amber layers intact.
