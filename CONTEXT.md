# Frontend Plugin Runtime

This context defines the language used to describe frontend plugins, their UI surfaces, and their observable runtime facts.

## Language

**Console Distribution**:
The composition root that selects and versions the Console's plugins, declares its Core Closure, supplies concrete contribution grants and policy, and launches the Host.
_Avoid_: Host, Plugin Runtime, Console Core Plugin

**Host**:
The browser-facing platform shell that bootstraps the Plugin Runtime, integrates browser and history adapters, and provides break-glass failure diagnostics and recovery. It contains no Console business semantics or plugin-specific governance rules.
_Avoid_: Console Distribution, Plugin Runtime, Console Core Plugin

**Break-glass UI**:
The Host's minimal failure-diagnostics and recovery experience, rendered through a path that does not depend on the Plugin Runtime, Console Core Plugin, Route Model, plugin theme, Extension Points, or Core Capabilities.
_Avoid_: Settings Page, Diagnostics Plugin, Console Route

**Plugin Runtime**:
The business-agnostic mechanism that resolves and activates plugins, manages contribution and UI lifecycles, owns the Route Model and conflict rules, and enforces contribution policy.
_Avoid_: Host, Console Distribution, Console Core Plugin

**Builtin Plugin**:
A plugin that executes in the Direct Host Realm through the local adapter. It shares declaration, composition, governance, and lifecycle semantics with Restricted Plugins without sharing their loading or isolation adapter.
_Avoid_: Required System Plugin, Restricted Plugin

**Restricted Plugin**:
A plugin that cannot enter the Direct Host Realm and is integrated under cooperative isolation, independently of whether its provenance is First-party, Partner, or Third-party.
_Avoid_: Untrusted Plugin, Sandboxed Plugin

**Required System Plugin**:
A Builtin Plugin that belongs to a distribution's Core Closure and whose successful activation is required before the runtime can become ready. It uses the public plugin protocol and does not gain hidden business capabilities from the Host.
_Avoid_: Priority Plugin, Ordinary Optional Plugin

**Console Core Plugin**:
The Required System Plugin that owns the Console product foundation, including its global layout, navigation, landing page, settings experience, and Console-specific extension points.
_Avoid_: Host Shell, Host UI, Optional Plugin

**Console Core API**:
The public contract package containing Console Core Extension Point identifiers, versioned context and payload types, and contribution constructors. It contains no Console Core implementation, React pages, Store, or Plugin Runtime implementation.
_Avoid_: Console Core Plugin, Platform SDK, UI Component Library

**Core Closure**:
The transitive set of Builtin Plugins required by the distribution's declared core roots. Failure of any member prevents Runtime Ready rather than merely lowering that plugin's priority.
_Avoid_: Startup Priority, Preferred Plugin

**Runtime Ready**:
The runtime condition reached after the Core Closure has activated successfully and its core declarations and protocols are available. It does not imply that business data has loaded, optional plugins have succeeded, or plugin Surfaces have downloaded or mounted.
_Avoid_: UI Ready, Data Ready, Plugin ACTIVE, All Plugins Running

**Console Presentation Failure**:
The failure of the Console Core Plugin's root presentation after Runtime Ready, leaving the Runtime ready but the normal Console unusable. The Host responds by presenting the Break-glass UI without reversing Runtime Ready.
_Avoid_: Bootstrap Failure, Runtime Not Ready, Ordinary Surface Failure

**Core Activation**:
The transactional registration of a Core Closure member's local declarations, dependencies, capabilities, and UI definitions. It excludes network requests and business-data loading, which occur during page or Surface execution.
_Avoid_: Application Loading, Surface Mounting, Business Initialization

**Provider Plugin**:
A plugin role that owns one or more Extension Points for other plugins to consume. Provider is a composition role, independent of execution boundary and provenance, and may overlap with Feature Plugin.
_Avoid_: Builtin Plugin, First-party Plugin

**Feature Plugin**:
A plugin role that contributes product functionality through Extension Points owned by itself or another Provider Plugin. Feature is a composition role, independent of execution boundary and provenance.
_Avoid_: Restricted Plugin, Third-party Plugin

**Plugin Provenance**:
The origin of a plugin, classified separately as First-party, Partner, or Third-party without implying its Builtin or Restricted execution boundary.
_Avoid_: Trust Boundary, Plugin Role

**Platform Capability**:
A narrowly scoped, versioned platform contract exposed to plugins, such as routes, plugin query or management, diagnostics, or audit. Its identity, schema, and semantics remain the same across Builtin and Restricted adapters, while access is explicitly granted rather than implied by private Host imports or Builtin placement.
_Avoid_: Host Context, Universal SDK, Hidden API

**Distribution Policy Bundle**:
The Console Distribution's static, versioned set of concrete contribution grants and policy inputs for one Runtime lifecycle. It is frozen after bootstrap, and changing it requires a reload.
_Avoid_: Host Policy, Dynamic Self-Authorization, Bridge Permission

**Route**:
An addressable Console page declaration owned by a plugin and resolved by the Plugin Runtime, backed by either a builtin view or a Surface Definition. A Route is a page declaration, not a mounted Surface Instance.
_Avoid_: Navigation Item, Surface Instance

**Route Contribution**:
One plugin-owned declaration of a Route, including its attachment to a Parent Route when applicable. It is the smallest declaration that can be quarantined independently of an otherwise valid parent.
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

**Navigation Container**:
A plugin-owned root or grouping boundary within one of the Console's navigation hierarchies. Multiple containers may coexist, and items form an explicit tree through stable `id` and `parentId` relationships rather than path or registration-order inference.
_Avoid_: Route Parent, UI Slot, Implicit Group

**Contribution Policy Engine**:
The Plugin Runtime's business-agnostic, deny-by-default authority for evaluating Extension Point admission contracts against concrete grants supplied by the Console Distribution. Authorization relates a contributor owner to a particular point and contract Major; execution boundary, provenance, references, and contributor declarations are not themselves authorization.
_Avoid_: Host Contribution Policy, Bridge Action Permission, Child Self-Authorization

**Route Layout**:
A Parent Route's persistent presentation around its selected Child Route. It remains mounted when navigation switches between children under the same parent.
_Avoid_: Arbitrary UI Container, Leaf Surface

**Route Context**:
The current Console location and parameter bindings associated with the selected Route, including parameters inherited from its ancestors. It is distinct from a Surface Definition's static initial configuration.
_Avoid_: Initial Parameters, Plugin Internal URL

**Route Quarantine**:
The exclusion of a conflicting Route Contribution from use by the Plugin Runtime. A conflict between children does not by itself invalidate their otherwise valid Parent Route or its entire namespace.
_Avoid_: Plugin Failure, Parent Namespace Invalidation

**Unavailable Route**:
A Route that cannot be reached because a required ancestor is missing or unusable. It need not itself be a conflicting Route Contribution or belong to a failed plugin.
_Avoid_: Conflicting Route, Plugin Failure

**Host Shell**:
The platform-owned runtime shell that bootstraps the plugin system and presents loading, fatal-error, diagnostics, and recovery experiences when normal Console operation is unavailable. It contains no Console business concepts or product UI such as global layout, navigation, Home, or Settings.
_Avoid_: Console Core Plugin, Global Layout, Product Shell

**Overview Route**:
The Console Core Plugin-owned landing page within the same Route model as other plugin pages. It is distinct from the Host Shell and from Runtime diagnostics or recovery UI.
_Avoid_: Host Shell, Router-external Home

**Route Ownership**:
The association between a Route owner and the Console locations claimed by that Route, allowing explicitly authorized Child Route contributions from other owners. It does not imply synchronization with a Restricted Plugin's internal navigation.
_Avoid_: Plugin URL Synchronization

**Deterministic Specialization**:
A same-owner Route whose claimed locations form a proper subset of another Route's locations under the Runtime's supported route language. It is a Runtime ownership rule, not a router ranking score or declaration-order preference.
_Avoid_: React Router Ranking, Registration Priority

**Contribution Diagnostic**:
A Runtime finding about a Route, Navigation, or UI contribution's availability, attributable to that contribution and its owning plugin. It is distinct from the plugin's Runtime state and from errors in a particular runtime occurrence or session.
_Avoid_: Plugin Failure, Runtime Skip Reason

**Navigation**:
A plugin-contributed item in a Navigation Container that may reference a Route by its identity. A Navigation item is an entry to a page or a grouping of entries, not the page itself; its grouping and order are governed by the container contract and Distribution grants.
_Avoid_: Route, Page

**Point Profile**:
A reusable, versioned business contract defining context and payload schemas, permitted policy dimensions, and any explicit Ref Contract parameter slots. A Point may bind those slots to registered Ref Contracts and narrow permitted constraints without redefining the Profile's schema.
_Avoid_: Extension Point, Extension Kind, Slot

**Extension Point**:
A plugin-owned acceptance declaration instantiating one Point Profile at a placement controlled by that owner. It fixes the Profile Major and permitted Ref Contract bindings, may narrow allowed cardinality, grouping, ordering, sizing, and presentation, and remains distinct from each runtime Slot occurrence.
_Avoid_: Slot Definition, Surface Container

**Extension Kind**:
A small, stable Plugin Runtime-defined category with distinct execution and lifecycle semantics; V1 defines route, navigation, action, tab, and surface. New business scenarios prefer a new Point Profile or Extension Point; a new Kind is justified only by genuinely new execution semantics.
_Avoid_: Surface Definition, Business Component Type

**Contribution Definition**:
A contributor-owned declaration identified by its owning plugin and plugin-local contribution identifier, matching its target Extension Point's Extension Kind. A UI contribution may reference a Surface Definition, while the extension model also accommodates other contribution types.
_Avoid_: Surface Instance, Slot

**Contribution Contract Assertion**:
An optional expectedProfile or expectedRefContract check against the authoritative contract resolved from a contribution's target Point Major. It permits fail-fast validation without selecting another Point, overriding its bindings, or granting access.
_Avoid_: Point Selector, Contract Override, Grant

**Action Contribution**:
A serializable declaration referencing a stable `actionId` owned by its contributor. The Plugin Runtime invokes the owner through its execution adapter with versioned context; public declarations contain no callback, React node, or raw Host command.
_Avoid_: Function Callback, Host Command, Button Component

**Action Invocation**:
One short-lived Runtime execution of an Action Contribution, identified by `invocationId` and carrying an immutable Context snapshot, whose session completes once as succeeded, failed, cancelled, or timed-out. Cancellation and timeout terminate the invocation's wait and execution resources without guaranteeing business rollback; the Runtime never automatically retries side effects.
_Avoid_: Surface Instance, Plugin-wide Session, Retried Command

**Tab Contribution**:
A declaration containing a stable `tabId`, tab metadata, and a reference to its owner's Surface Definition. Selection lazily creates its Execution Scope, leaving ends that scope in V1, and any URL representation remains the containing Route owner's decision.
_Avoid_: Route, React Component, Eager Page

**Slot**:
One runtime Placement occurrence of an Extension Point. It carries no business semantics of its own and remains distinct from the Point definition and any contribution execution presented there.
_Avoid_: Extension Point Definition, Surface Container

**Presentation Root**:
The boundary of one execution attempt's presented UI, within which its physical mounting locations may be resolved. Physical nesting does not merge the roots or their ownership.
_Avoid_: Plugin Namespace, Execution Scope

**Root Presentation**:
The Distribution-selected Core Closure member's Surface used as the Console's root UI. It is addressed by ownerPluginId and surfaceId, validated by the Runtime, and mounted by the Host through the public execution entry point.
_Avoid_: Presentation Root, Host-owned Business UI, Hardcoded Console Core Import

**DOM Anchor**:
A physical mounting location associated with an occurrence inside its current Presentation Root. It neither identifies the occurrence nor grants authority to place or execute a contribution.
_Avoid_: Slot Identity, Authorization Token

**Slot Context**:
Business context supplied by a Slot's placement owner to the contributions presented at that occurrence. It is distinct from Route Context and a contribution's static initial configuration.
_Avoid_: Route Context, Initial Parameters, Shared Store

**Occurrence Observation**:
A Runtime-reported view of a Slot's independent input acceptance, contribution availability, execution, visibility, and lifetime facts. These dimensions can express different conditions simultaneously and do not collapse into one overall status.
_Avoid_: Aggregate Status, Business Event, Contribution Diagnostic

**Context Contract**:
The versioned agreement defining the structure and meaning of an Extension Point's Slot Context. Context values cross plugin boundaries as serializable references rather than Stores, complete domain objects, functions, or framework values; contract version is independent of plugin package version.
_Avoid_: Plugin Version, Host API Version

**Context Key**:
The placement owner's designation of the business context within which a Slot's executions retain continuity. Equal keys in different Slot occurrences do not identify a shared execution.
_Avoid_: Slot ID, Surface Instance ID, Global Resource ID

**Ref Contract**:
A domain API-owned contract with a namespaced identity and Major defining the schema and meaning of a serializable item reference. The Distribution assembles these contracts for Runtime validation and freezing; generic List and Detail Profiles expose explicit parameter slots for their bindings.
_Avoid_: Complete Domain Object, Point-local Schema, Profile

**Ref Trait / Predicate**:
A stable, explicitly published attribute or predicate in a Ref Contract's public vocabulary for declarative action availability. Runtime evaluation uses finite comparisons against that vocabulary, while complex domain decisions remain with the Owner.
_Avoid_: Arbitrary Schema Path, JavaScript Callback, Authorization Grant

**ResourceRef**:
A Kubernetes-domain reference described by clusterId, apiVersion, kind, optional namespace, name, and optional uid. It is one possible Ref Contract binding alongside PluginRef, AuditRecordRef, or UserRef.
_Avoid_: Generic Item Reference, Complete Kubernetes Object

**Surface Sizing Policy**:
The placement owner's rules and constraints for how a Surface participates in layout within its actual container. It is distinct from the container's current geometry and from business Slot Context.
_Avoid_: Slot Context, Plugin Viewport Size

**Execution Scope**:
The Plugin Runtime-owned lifetime of one logical UI execution and its logical resources, which can encompass successive execution attempts and overlays. It is distinct from the current attempt and from plugin bootstrap state.
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
A Plugin Runtime-issued reference to an overlay and its one-shot completion or cancellation outcome within its Owner Execution Scope. It can outlive an individual caller attempt, but cannot become valid again after its owning scope ends.
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

**Execution Session**:
A communication lifetime belonging to exactly one Surface Execution Attempt or Action Invocation. Its adapter-specific realization preserves that ownership and cannot become a permanent plugin-wide session.
_Avoid_: Execution Scope, Plugin-wide Session

**BridgeSession**:
The Restricted Adapter's realization of an Execution Session for one Surface Execution Attempt or Action Invocation.
_Avoid_: Global Bridge, Plugin-wide Bridge

**UI Control Plane**:
The Plugin Runtime-defined interactions that coordinate UI composition and its runtime state. Its semantics are distinct from Capability RPC even when they share a communication session or transport.
_Avoid_: Business Context, Capability RPC, Business Event Channel

**Subscription**:
A capability-owned event stream whose lifetime cannot exceed its BridgeSession.
_Avoid_: Event Topic, Global Event
