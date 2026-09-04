# Frontend Plugin Runtime

This context defines the language used to describe frontend plugins, their UI surfaces, and their observable runtime facts.

## Language

**Restricted Plugin**:
An external plugin that cannot enter the Direct Host Realm and is integrated under cooperative isolation.
_Avoid_: Untrusted Plugin, Sandboxed Plugin

**Route**:
An addressable Host page declaration provided by the Host or a plugin, backed by either a builtin view or a Surface Definition. A Route is a page declaration, not a mounted Surface Instance.
_Avoid_: Navigation Item, Surface Instance

**Route Contribution**:
One Host- or plugin-owned declaration of a Route, including its attachment to a Parent Route when applicable. It is the smallest declaration that can be quarantined independently of an otherwise valid parent.
_Avoid_: Parent Namespace, Plugin

**Parent Route**:
A Route to which a Child Route is explicitly attached, providing its ancestry and inherited location parameters. Route ancestry is distinct from Navigation grouping.
_Avoid_: Navigation Parent, Path Prefix

**Child Route**:
A Route Contribution explicitly attached beneath a Parent Route, with its own owner and a location relative to that parent. A cross-owner attachment requires explicit authorization.
_Avoid_: Implicit Prefix Match, Navigation Child

**Child Route Extension Point**:
A Parent Route owner's explicit declaration that its Route accepts Child Route contributions. It is limited to nested route composition, not arbitrary UI injection.
_Avoid_: UI Slot, Arbitrary UI Container

**Navigation Extension Point**:
A Navigation container owner's explicit declaration that its container accepts contributions from other owners. It governs navigation composition, not arbitrary UI injection.
_Avoid_: UI Slot, Implicit Parent Reference

**Host Contribution Policy**:
The platform's shared authority for deciding which owners may contribute to declared extension points, including Route, Navigation, and UI composition. For UI composition, authorization relates a contributor owner to a particular point and contract Major; references are not themselves authorization.
_Avoid_: Host Route Policy, Host Navigation Policy, Bridge Action Permission, Child Self-Authorization

**Route Layout**:
A Parent Route's persistent presentation around its selected Child Route. It remains mounted when navigation switches between children under the same parent.
_Avoid_: Arbitrary UI Container, Leaf Surface

**Route Context**:
The current Host location and parameter bindings associated with the selected Route, including parameters inherited from its ancestors. It is distinct from a Surface Definition's static initial configuration.
_Avoid_: Initial Parameters, Plugin Internal URL

**Route Quarantine**:
The exclusion of a conflicting Route Contribution from use by the Host. A conflict between children does not by itself invalidate their otherwise valid Parent Route or its entire namespace.
_Avoid_: Plugin Failure, Parent Namespace Invalidation

**Unavailable Route**:
A Route that cannot be reached because a required ancestor is missing or unusable. It need not itself be a conflicting Route Contribution or belong to a failed plugin.
_Avoid_: Conflicting Route, Plugin Failure

**Host Shell**:
The persistent Host frame containing Navigation and the content area for the current Route. It is distinct from the page displayed in that area.
_Avoid_: Overview Page, Plugin Page

**Overview Route**:
The Host-provided landing page within the same Route model as plugin pages. It is distinct from the persistent Host Shell.
_Avoid_: Host Shell, Router-external Home

**Route Ownership**:
The association between a Route owner and the Host locations claimed by that Route, allowing explicitly authorized Child Route contributions from other owners. It does not imply synchronization with a Restricted Plugin's internal navigation.
_Avoid_: Plugin URL Synchronization

**Deterministic Specialization**:
A same-owner Route whose claimed locations form a proper subset of another Route's locations under the Host's supported route language. It is a Host ownership rule, not a router ranking score or declaration-order preference.
_Avoid_: React Router Ranking, Registration Priority

**Contribution Diagnostic**:
A Host finding about a Route, Navigation, or UI contribution's availability, attributable to that contribution and its owning plugin. It is distinct from the plugin's Runtime state and from errors in a particular runtime occurrence or session.
_Avoid_: Plugin Failure, Runtime Skip Reason

**Navigation**:
A plugin-contributed item in the Host's navigation hierarchy that may reference a Route by its identity. A Navigation item is an entry to a page or a grouping of entries, not the page itself.
_Avoid_: Route, Page

**Extension Point**:
A plugin-owned contract accepting one Host-defined Extension Kind, independent of where it occurs in the owner's UI. Its identity consists of the owning plugin and a local identifier, while its definition is distinct from runtime Slots and contributed UI resources.
_Avoid_: Slot Definition, Surface Container

**Extension Kind**:
A Host-defined category of contribution with its own payload and presentation or execution contract. Surface is one such category; individual business Cards, Panels, and Charts do not each require a different kind.
_Avoid_: Surface Definition, Business Component Type

**Contribution Definition**:
A contributor-owned declaration identified by its owning plugin and plugin-local contribution identifier, matching its target Extension Point's Extension Kind. A UI contribution may reference a Surface Definition, while the extension model also accommodates other contribution types.
_Avoid_: Surface Instance, Slot

**Slot**:
One runtime occurrence of an Extension Point in its placement owner's UI. A Slot is distinct from both the Extension Point's definition and any Surface Instance displayed there.
_Avoid_: Extension Point Definition, Surface Container

**Presentation Root**:
The boundary of one execution attempt's presented UI, within which its physical mounting locations may be resolved. Physical nesting does not merge the roots or their ownership.
_Avoid_: Plugin Namespace, Execution Scope

**DOM Anchor**:
A physical mounting location associated with an occurrence inside its current Presentation Root. It neither identifies the occurrence nor grants authority to place or execute a contribution.
_Avoid_: Slot Identity, Authorization Token

**Slot Context**:
Business context supplied by a Slot's placement owner to the contributions presented at that occurrence. It is distinct from Route Context and a contribution's static initial configuration.
_Avoid_: Route Context, Initial Parameters, Shared Store

**Occurrence Observation**:
A Host-reported view of a Slot's independent input acceptance, contribution availability, execution, visibility, and lifetime facts. These dimensions can express different conditions simultaneously and do not collapse into one overall status.
_Avoid_: Aggregate Status, Business Event, Contribution Diagnostic

**Context Contract**:
The versioned agreement defining the structure and meaning of an Extension Point's Slot Context. Its version is independent of the owning plugin's package version.
_Avoid_: Plugin Version, Host API Version

**Context Key**:
The placement owner's designation of the business context within which a Slot's executions retain continuity. Equal keys in different Slot occurrences do not identify a shared execution.
_Avoid_: Slot ID, Surface Instance ID, Global Resource ID

**Surface Sizing Policy**:
The placement owner's rules and constraints for how a Surface participates in layout within its actual container. It is distinct from the container's current geometry and from business Slot Context.
_Avoid_: Slot Context, Plugin Viewport Size

**Execution Scope**:
The Host-owned lifetime of one logical UI execution and its logical resources, which can encompass successive execution attempts and overlays. It is distinct from the current attempt and from plugin bootstrap state.
_Avoid_: Caller Session, Activation Scope, Plugin ACTIVE

**Execution Attempt**:
One concrete attempt to present a logical UI execution, owning its presentation resources. A replacement attempt may belong to the same still-valid Execution Scope without inheriting the old attempt's presentation identity.
_Avoid_: Execution Scope, Context Key

**Contribution Scope**:
A child Execution Scope for one selected contribution in a Slot occurrence within its current business continuity. It belongs to the contributor and also depends on the lifetime of the parent presentation attempt and occurrence.
_Avoid_: Placement Owner Scope, Attempt

**Owner Execution Scope**:
The specific Execution Scope to which a runtime resource belongs, which may itself be a Contribution Scope. It is an ownership role of an Execution Scope, not a separate kind of scope or the resource's caller session.
_Avoid_: Caller Session

**Overlay Handle**:
A Host-issued reference to an overlay and its one-shot completion or cancellation outcome within its Owner Execution Scope. It can outlive an individual caller attempt, but cannot become valid again after its owning scope ends.
_Avoid_: Pending RPC, Caller Session

**Surface Definition**:
A declared UI resource that can be referenced by a Route or UI contribution, including a free-form Card, Panel, or Chart. It is independent of the Slot in which an instance may be displayed.
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

**UI Control Plane**:
The Host-defined interactions that coordinate UI composition and its runtime state. Its semantics are distinct from Capability RPC even when they share a communication session or transport.
_Avoid_: Business Context, Capability RPC, Business Event Channel

**Subscription**:
A capability-owned event stream whose lifetime cannot exceed its BridgeSession.
_Avoid_: Event Topic, Global Event
