# Frontend Plugin Runtime

This context defines the language used to describe frontend plugins, their UI surfaces, and their observable runtime facts.

## Language

**Restricted Plugin**:
An external plugin that cannot enter the Direct Host Realm and is integrated under cooperative isolation.
_Avoid_: Untrusted Plugin, Sandboxed Plugin

**Surface Definition**:
A manifest-declared UI resource that can be referenced by a Route or UI Extension.
_Avoid_: Surface Contribution

**Surface Instance**:
One concrete mounting of a Surface Definition; multiple instances of the same definition may exist independently.
_Avoid_: Plugin Instance

**Plugin ACTIVE**:
The bootstrap fact that a plugin was accepted into the current runtime and may provide its declared capabilities, contributions, or surfaces; it does not mean a surface is mounted.
_Avoid_: Plugin Running, Wujie Running

**BridgeSession**:
A host-created communication session owned by exactly one Surface Instance.
_Avoid_: Global Bridge, Plugin-wide Bridge

**Subscription**:
A capability-owned event stream whose lifetime cannot exceed its BridgeSession.
_Avoid_: Event Topic, Global Event
