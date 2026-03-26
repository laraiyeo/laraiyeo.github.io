---
title: Modifiers
description: SwiftUI view modifiers for customizing component appearance and behavior.
sourceCodeUrl: 'https://github.com/expo/expo/tree/main/packages/expo-ui'
packageName: '@expo/ui'
platforms: ['ios', 'tvos']
---

# Modifiers

SwiftUI view modifiers for customizing component appearance and behavior.
iOS, tvOS

SwiftUI view modifiers that allow you to customize the appearance and behavior of UI components.

## Installation

```sh
npx expo install @expo/ui
```

If you are installing this in an [existing React Native app](/bare/overview), make sure to [install `expo`](/bare/installing-expo-modules) in your project.

## Usage

Modifiers are applied to components using the `modifiers` prop with an array syntax. You can combine multiple modifiers to create complex styling and behavior.

```tsx
import { Text, Host, VStack } from '@expo/ui/swift-ui';
import {
  background,
  cornerRadius,
  padding,
  shadow,
  foregroundColor,
  onTapGesture,
} from '@expo/ui/swift-ui/modifiers';

function ModifiersExample() {
  const [isEnabled, setIsEnabled] = useState(false);

  return (
    <Host style={{ flex: 1 }}>
      <VStack spacing={20}>
        {/* Basic styling modifiers */}
        <Text
          modifiers={[
            background('#FF6B6B'),
            cornerRadius(12),
            padding({ all: 16 }),
            foregroundColor('#FFFFFF'),
          ]}>
          Basic styled text
        </Text>

        {/* Complex combination with shadow and interaction */}
        <Text
          modifiers={[
            background('#4ECDC4'),
            cornerRadius(16),
            padding({ horizontal: 20, vertical: 12 }),
            shadow({ radius: 4, x: 0, y: 2, color: '#4ECDC440' }),
            onTapGesture(() => console.log('Tapped!')),
          ]}>
          Styled with shadow and tap gesture
        </Text>

        {/* Conditional modifiers using spread operator */}
        <Text
          modifiers={[
            background('#9B59B6'),
            cornerRadius(8),
            padding({ all: 14 }),
            ...(isEnabled
              ? [shadow({ radius: 6, y: 3 }), scaleEffect(1.02)]
              : [grayscale(0.5), opacity(0.7)]),
          ]}>
          Conditional styling
        </Text>
      </VStack>
    </Host>
  );
}
```

> You can also create custom modifiers that work with any Expo UI component. See the [Extending with SwiftUI](/guides/expo-ui-swift-ui/extending) guide for details.

## API

```tsx
import { background, cornerRadius, padding, shadow, foregroundColor, onTapGesture } from '@expo/ui/swift-ui/modifiers';
```

## Constants

### `Animation`

Supported platforms: iOS, tvOS.

Built-in animation presets for the `animation` modifier. Presets:

-   Timing presets (`easeInOut`, `easeIn`, `easeOut`, `linear`) accept [`TimingAnimationParams`](#timinganimationparams).
-   `spring` accepts [`SpringAnimationParams`](#springanimationparams).
-   `interpolatingSpring` accepts [`InterpolatingSpringAnimationParams`](#interpolatingspringanimationparams).
-   Chaining returns [`ChainableAnimationType`](#chainableanimationtype).

Example

```tsx
import { Host, VStack } from '@expo/ui/swift-ui';
import { animation, Animation } from '@expo/ui/swift-ui/modifiers';

function Example() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Host style={{ flex: 1 }}>
      <VStack modifiers={[animation(Animation.spring({ duration: 0.8 }), isExpanded)]}>
        //...
      </VStack>
    </Host>
  );
}
```

### `shapes`

Supported platforms: iOS, tvOS.

Shape builders for modifiers that accept shapes, such as `background` and `containerShape`.

Shapes: `roundedRectangle`, `capsule`, `rectangle`, `ellipse`, `circle`.

Example

```tsx
import { background, shapes } from '@expo/ui/swift-ui/modifiers';
import { Text, Host } from '@expo/ui/swift-ui';

function Example() {
  return (
    <Host>
    <Text
      modifiers={[
        background('#000', shapes.roundedRectangle({ cornerRadius: 12 })),
      ]}
    >
      Hello, world!
    </Text>
  </Host>
  );
}
```

## Methods

### `accessibilityHint(hint)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `hint` | `string` | The accessibility hint. |

  

Sets accessibility hint for the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/accessibilityhint\(_:\)).

### `accessibilityLabel(label)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `label` | `string` | The accessibility label. |

  

Sets accessibility label for the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/accessibilitylabel\(_:\)).

### `accessibilityValue(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `value` | `string` | The accessibility value. |

  

Sets accessibility value for the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/accessibilityvalue\(_:\)).

### `allowsTightening(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type |
| --- | --- |
| `value` | `boolean` |

  

Sets whether text in this view can compress the space between characters when necessary to fit text in a line

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/allowstightening\(_:\)).

### `animation(animationObject, animatedValue)`

Supported platforms: iOS, tvOS.

| Parameter | Type |
| --- | --- |
| `animationObject` | [ChainableAnimationType](#chainableanimationtype) |
| `animatedValue` | `number | boolean` |

  

Returns: `ModifierConfig`

### `aspectRatio(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ contentMode: 'fill' | 'fit', ratio: number }` | Width/height aspect ratio and content mode. |

  

Sets aspect ratio constraint.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/aspectratio\(_:contentmode:\)).

### `background(color, shape)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `color` | [Color](#color) | The background color (hex string). For example, `#FF0000`. |
| `shape`(optional) | `Shape` | Optional shape to clip the background. If not provided, the background will fill the entire view. |

  

Sets the background of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/background\(_:alignment:\)).

### `backgroundOverlay(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | { alignment: 'center' | 'top' | 'bottom' | 'leading' | 'trailing', color: [Color](#color) } | Background color and alignment. |

  

Adds a background behind the view.

Returns: `ModifierConfig`

### `badge(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `value`(optional) | `string` | Text view to display as a badge. Set the value to nil to hide the badge. |

  

Generates a badge for the view from a localized string key.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/badge\(_:\)).

### `badgeProminence(badgeType)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `badgeType` | `'standard' | 'increased' | 'decreased'` | Select the type of badge |

  

The prominence to apply to badges associated with this environment.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/badgeprominence\(_:\)).

### `blur(radius)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `radius` | `number` | The blur radius. |

  

Applies blur to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/blur\(radius:opaque:\)).

### `bold()`

Supported platforms: iOS, tvOS.

Makes text bold. When applied to `Text`, it works on all iOS/tvOS versions. When used on regular views, it requires iOS 16.0+/tvOS 16.0+.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/text/bold\(\)).

### `border(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | { color: [Color](#color), width: number } | The border parameters. Color and width. |

  

Adds a border to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/border\(_:width:\)).

### `brightness(amount)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `amount` | `number` | Brightness adjustment (-1 to 1). |

  

Adjusts the brightness of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/brightness\(_:\)).

### `buttonStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | `'automatic' | 'bordered' | 'borderedProminent' | 'borderless' | 'glass' | 'glassProminent' | 'plain'` | The button style. `'glass'` and `'glassProminent'` are available on iOS 26+ and tvOS 26+ only. |

  

Sets the button style for button views.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/buttonstyle\(_:\)).

### `clipped(clipped)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `clipped`(optional) | `boolean` | Whether to clip content. Default: `true` |

  

Clips content to bounds.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/clipped\(antialiased:\)).

### `clipShape(shape, cornerRadius)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `shape` | `'circle' | 'ellipse' | 'roundedRectangle' | 'capsule' | 'rectangle'` | The clipping shape. |
| `cornerRadius`(optional) | `number` | Corner radius for rounded rectangle (default: 8) |

  

Clips the view to a specific shape.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/clipshape\(_:style:\)).

### `colorInvert(inverted)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `inverted`(optional) | `boolean` | Whether to invert colors. Default: `true` |

  

Inverts the colors of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/colorinvert\(\)).

### `containerRelativeFrame(params)`

Supported platforms: iOS 17.0+, tvOS 17.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ alignment: 'center' | 'top' | 'bottom' | 'leading' | 'trailing' | 'topLeading' | 'topTrailing' | 'bottomLeading' | 'bottomTrailing', axes: 'vertical' | 'horizontal' | 'both', count: number, spacing: number, span: number }` | The content relative frame parameters: `axes`, `count`, `span`, `spacing` and `alignment`. |

  

Positions this view within an invisible frame with a size relative to the nearest container.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/containerRelativeFrame\(_:alignment:\)).

### `containerShape(shape)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `shape` | `Shape` | A shape configuration from the shapes API |

  

Sets the container shape for the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/containershape\(_:\)).

### `contentShape(shape)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `shape` | `Shape` | A shape configuration from the shapes API (rectangle, circle, capsule, ellipse, roundedRectangle). |

  

Defines the content shape for hit-testing purposes.

This modifier is essential for making entire view areas (including `Spacer` or empty space) interactive. Without it, only visible elements like `Text` or `Image` respond to tap gestures.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/contentshape\(_:eofill:\)).

Example

```tsx
import { HStack, List, Section, Spacer, Text } from "@expo/ui/swift-ui";
import { contentShape, onTapGesture } from "@expo/ui/swift-ui/modifiers";
import { shapes } from "@expo/ui/swift-ui/modifiers";

function InteractiveRow() {
  return (
    <List>
      <Section title="Settings">
        <HStack
          modifiers={[
            contentShape(shapes.rectangle()),
            onTapGesture(() => console.log("Row tapped!"))
          ]}
        >
          <Text>Label</Text>
          <Spacer />
          <Text>Value</Text>
        </HStack>
      </Section>
    </List>
  );
}
```

### `contentTransition(transitionType, params)`

Supported platforms: iOS 16.0+, tvOS 16.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `transitionType` | `'identity' | 'numericText' | 'opacity' | 'interpolate'` | The type of content transition. |
| `params`(optional) | `{ countsDown: boolean }` | Optional parameters. |

  

Sets the content transition type for a view. Useful for animating changes in text content, especially numeric text. Use with the [`animation`](#animationanimationobject-animatedvalue) modifier to animate the transition when the content changes.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/contenttransition\(_:\)).

Example

```tsx
<Text modifiers={[contentTransition('numericText'), animation(Animation.default, count)]}>
  {count.toString()}
</Text>
```

### `contrast(amount)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `amount` | `number` | Contrast multiplier (0 to infinity, 1 = normal). |

  

Adjusts the contrast of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/contrast\(_:\)).

### `controlSize(size)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `size` | `'small' | 'large' | 'mini' | 'regular' | 'extraLarge'` | The control size. |

  

Sets the size of controls within this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/controlsize\(_:\)).

### `cornerRadius(radius)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `radius` | `number` | The corner radius value. |

  

Applies corner radius to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/cornerradius\(_:antialiased:\)).

### `createModifier(type, params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `type` | `string` | The modifier type string that maps to a registered native modifier. |
| `params`(optional) | `Record<string, any>` | Additional parameters to pass to the modifier. Default: `{}` |

  

Factory function to create modifier configuration objects. This is used by all built-in modifier functions and can be used by 3rd party libraries to create custom modifiers.

Returns: `ModifierConfig`

A `ModifierConfig` object that can be passed in the `modifiers` prop array.

Example

```ts
// In a 3rd party package
import { createModifier } from '@expo/ui/swift-ui/modifiers';

export const blurEffect = (params: { radius: number; style?: string }) =>
  createModifier('blurEffect', params);
```

### `datePickerStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | [DatePickerStyleType](#datepickerstyletype) | The style for the date picker. |

  

Sets the style for the date picker.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/datepickerstyle\(_:\)).

### `defaultScrollAnchor(anchor)`

Supported platforms: iOS 17.0+, macOS 14.0+, tvOS 17.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `anchor` | [UnitPointValue](#unitpointvalue) | null | The anchor point for initial scroll position and content size changes, or `null` to reset. |

  

Sets the default anchor point for a scroll view's content.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/defaultscrollanchor\(_:\)).

### `defaultScrollAnchorForRole(anchor, role)`

Supported platforms: iOS 18.0+, macOS 15.0+, tvOS 18.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `anchor` | [UnitPointValue](#unitpointvalue) | null | The anchor point, or `null` to opt out of this role. |
| `role` | `'initialOffset' | 'sizeChanges' | 'alignment'` | The scroll anchor role: `'initialOffset'`, `'sizeChanges'`, or `'alignment'`. |

  

Sets the default anchor point for a scroll view for a specific role. Pass `null` to opt out of a specific role while keeping anchors for other roles.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/defaultscrollanchor\(_:for:\)).

### `deleteDisabled(disabled)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `disabled`(optional) | `boolean` | Whether deletion should be disabled. Default: `true` |

  

Disables the delete action for a view in a list. Apply to items within a `ForEach` to prevent them from being deleted.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/deletedisabled\(_:\)).

### `disabled(disabled)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `disabled`(optional) | `boolean` | Whether the view should be disabled. Default: `true` |

  

Disables or enables a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/disabled\(_:\)).

### `environment(config)`

Supported platforms: iOS, tvOS.

Overload #1

| Parameter | Type |
| --- | --- |
| `config` | [EnvironmentConfig](#environmentconfig) |

  

Sets a SwiftUI environment value.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/environment\(_:_:\)).

### `environment(key, value)`

Supported platforms: iOS, tvOS.

Overload #2

| Parameter | Type |
| --- | --- |
| `key` | `'colorScheme' | 'editMode' | 'locale' | 'timeZone'` |
| `value` | `string` |

  

Sets a SwiftUI environment value.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/environment\(_:_:\)).

### `fixedSize(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params`(optional) | `{ horizontal: boolean, vertical: boolean }` | Whether the view should use its ideal width or height. |

  

Controls fixed size behavior.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/fixedsize\(\)).

### `font(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ design: 'default' | 'rounded' | 'serif' | 'monospaced', family: string, size: number, weight: 'light' | 'bold' | 'black' | 'medium' | 'regular' | 'ultraLight' | 'thin' | 'semibold' | 'heavy' }` | The font configuration. When `family` is provided, it uses Font.custom(). When `family` is not provided, it uses Font.system() with the specified weight and design. |

  

Sets the font properties of a view. Supports both custom font families and system fonts with weight and design options.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation for `custom(_:size:)`](https://developer.apple.com/documentation/swiftui/font/custom\(_:size:\)) and Official [SwiftUI documentation for `system(size:weight:design:)`](https://developer.apple.com/documentation/swiftui/font/system\(size:weight:design:\)).

Example

```tsx
// Custom font family
<Text modifiers={[font({ family: 'Helvetica', size: 18 })]}>Custom Font Text</Text>

// System font with weight and design
<Text modifiers={[font({ weight: 'bold', design: 'rounded', size: 16 })]}>System Font Text</Text>
```

> **Deprecated:** Use `foregroundStyle` instead.

### `foregroundColor(color)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `color` | [Color](#color) | The foreground color (hex string). |

  

Sets the foreground color/tint of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/foregroundcolor\(_:\)).

### `foregroundStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | `string | { color: string, type: 'color' } | { style: 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'quinary', type: 'hierarchical' } | { colors: string[], endPoint: { x: number, y: number }, startPoint: { x: number, y: number }, type: 'linearGradient' } | { center: { x: number, y: number }, colors: string[], endRadius: number, startRadius: number, type: 'radialGradient' } | { center: { x: number, y: number }, colors: string[], type: 'angularGradient' }` | The foreground style configuration. Can be: . **Simple Color (string):**
-   Hex colors: `'#FF0000'`, `'#RGB'`, `'#RRGGBB'`, `'#AARRGGBB'`
-   Named colors: `'red'`, `'blue'`, `'green'`, and so on.

. **Explicit Color Object:**

```ts
{ type: 'color', color: '#FF0000' }
```

. **Hierarchical Styles (Semantic):** Auto-adapting semantic styles that respond to light/dark mode and accessibility settings:

```ts
{ type: 'hierarchical', style: 'primary' }    // Most prominent (main content, headlines)
{ type: 'hierarchical', style: 'secondary' }  // Supporting text, subheadlines
{ type: 'hierarchical', style: 'tertiary' }   // Less important text, captions
{ type: 'hierarchical', style: 'quaternary' } // Subtle text, disabled states
{ type: 'hierarchical', style: 'quinary' }    // Most subtle (iOS 16+, fallback to quaternary)
```

. **Linear Gradient:**

```ts
{
  type: 'linearGradient',
  colors: ['#FF0000', '#0000FF', '#00FF00'],
  startPoint: { x: 0, y: 0 },    // Top-left
  endPoint: { x: 1, y: 1 }       // Bottom-right
}
```

. **Radial Gradient:**

```ts
{
  type: 'radialGradient',
  colors: ['#FF0000', '#0000FF'],
  center: { x: 0.5, y: 0.5 },    // Center of view
  startRadius: 0,                // Inner radius
  endRadius: 100                 // Outer radius
}
```

. **Angular Gradient (Conic):**

```ts
{
  type: 'angularGradient',
  colors: ['#FF0000', '#00FF00', '#0000FF'],
  center: { x: 0.5, y: 0.5 }     // Rotation center
}
```

 |

  

Sets the foreground style of a view with comprehensive styling options.

Replaces the deprecated `foregroundColor` modifier with enhanced capabilities including colors, gradients, and semantic hierarchical styles that adapt to system appearance.

Returns: `ModifierConfig`

A view modifier that applies the specified foreground style

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/foregroundstyle\(_:\)).

Example

```tsx
// Simple usage
<Text modifiers={[foregroundStyle('#FF0000')]}>Red Text</Text>

// Adaptive hierarchical styling
<Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
  Supporting Text
</Text>

// Linear gradient
<Text modifiers={[foregroundStyle({
  type: 'linearGradient',
  colors: ['#FF6B35', '#F7931E', '#FFD23F'],
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 1, y: 0 }
})]}>
  Gradient Text
</Text>
```

### `frame(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ alignment: 'center' | 'top' | 'bottom' | 'leading' | 'trailing' | 'topLeading' | 'topTrailing' | 'bottomLeading' | 'bottomTrailing', height: number, idealHeight: number, idealWidth: number, maxHeight: number, maxWidth: number, minHeight: number, minWidth: number, width: number }` | The frame parameters. Width, height, minWidth, maxWidth, minHeight, maxHeight, idealWidth, idealHeight and alignment. |

  

Sets the frame properties of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/frame\(width:height:alignment:\)).

### `gaugeStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | [GaugeStyleType](#gaugestyletype) | The style for the gauge. |

  

Sets the style for the gauge.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/gaugestyle).

### `glassEffect(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params`(optional) | { cornerRadius: number, glass: { interactive: boolean, tint: [Color](#color), variant: 'clear' | 'regular' | 'identity' }, shape: 'circle' | 'ellipse' | 'roundedRectangle' | 'capsule' | 'rectangle' } | The glass effect parameters. Variant, interactive, tint and shape. |

  

Applies a glass effect to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/glasseffect\(_:in:\)).

### `glassEffectId(id, namespaceId)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The id of the glass effect. |
| `namespaceId` | `string` | The namespace id of the glass effect. Use Namespace component to create a namespace. |

  

Associates an identity value to Liquid Glass effects defined within a `GlassEffectContainer`.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/glasseffectid\(_:in:\)).

### `grayscale(amount)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `amount` | `number` | Grayscale amount (0 to 1). |

  

Makes a view grayscale.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/grayscale\(_:\)).

### `gridCellAnchor(anchor)`

Supported platforms: iOS 16+.

| Parameter | Type | Description |
| --- | --- | --- |
| `anchor` | `{ anchor: 'center' | 'top' | 'bottom' | 'leading' | 'trailing' | 'topLeading' | 'topTrailing' | 'bottomLeading' | 'bottomTrailing' | 'zero', type: 'preset' } | { points: { x: number, y: number }, type: 'custom' }` | The unit point that defines how to align the view within the bounds of its grid cell. |

  

Specifies a custom alignment anchor for a view that acts as a grid cell.

Returns: `ModifierConfig`

A view that uses the specified anchor point to align its content.

Example

```tsx
// Using a preset anchor
<Rectangle
  modifiers={[
    gridCellAnchor({ type: 'preset', anchor: 'center' }),
  ]}
/>

// Using a custom anchor point
<Rectangle
  modifiers={[
    gridCellAnchor({ type: 'custom', points: { x: 0.3, y: 0.8 } }),
  ]}
/>
```

### `gridCellColumns(count)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `count`(optional) | `number` | The number of columns that the view should consume when placed in a grid row. |

  

Tells a view that acts as a cell in a grid to span the specified number of columns.

Returns: `ModifierConfig`

A view that occupies the specified number of columns in a grid row.

### `gridCellUnsizedAxes(axes)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `axes`(optional) | `'vertical' | 'horizontal'` | The dimensions in which the grid shouldn’t offer the view a share of any available space. This prevents a flexible view like a Spacer, Divider, or Color from defining the size of a row or column. |

  

Asks grid layouts not to offer the view extra size in the specified axes.

Returns: `ModifierConfig`

A view that doesn’t ask an enclosing grid for extra size in one or more axes.

### `gridColumnAlignment(alignment)`

Supported platforms: iOS 16+.

| Parameter | Type | Description |
| --- | --- | --- |
| `alignment`(optional) | `'center' | 'leading' | 'trailing'` | The HorizontalAlignment guide to use for the grid column that the view appears in. |

  

Overrides the default horizontal alignment of the grid column that the view appears in.

Returns: `ModifierConfig`

A view that uses the specified horizontal alignment, and that causes all cells in the same column of a grid to use the same alignment.

### `headerProminence(prominence)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `prominence` | `'standard' | 'increased'` | The prominence to apply. |

  

Sets the header prominence for this view.

Returns: `ModifierConfig`

### `hidden(hidden)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `hidden`(optional) | `boolean` | Whether the view should be hidden. Default: `true` |

  

Hides or shows a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/hidden\(_:\)).

### `hueRotation(angle)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `angle` | `number` | Hue rotation angle in degrees. |

  

Applies a hue rotation to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/huerotation\(_:\)).

### `ignoreSafeArea(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params`(optional) | `{ edges: 'top' | 'bottom' | 'vertical' | 'leading' | 'trailing' | 'horizontal' | 'all', regions: 'all' | 'container' | 'keyboard' }` | The safe area regions to ignore and the edges to expand into. |

  

Allows a view to ignore safe area constraints.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/ignoressafearea\(_:edges:\)).

### `interactiveDismissDisabled(isDisabled)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `isDisabled`(optional) | `boolean` | Whether interactive dismiss is disabled (default: true). Default: `true` |

  

Disables interactive dismissal of a sheet.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/interactivedismissdisabled\(_:\)).

### `italic()`

Supported platforms: iOS, tvOS.

Makes text italic. When applied to `Text`, it works on all iOS/tvOS versions. When used on regular views, it requires iOS 16.0+/tvOS 16.0+.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/text/italic\(\)).

### `kerning(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type |
| --- | --- |
| `value`(optional) | `number` |

  

Sets the spacing, or kerning, between characters for the text in this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/kerning\(_:\)).

### `labelsHidden()`

Supported platforms: iOS, tvOS.

Hides the labels of any controls contained within this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/labelshidden\(\)).

### `labelStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | `'automatic' | 'iconOnly' | 'titleAndIcon' | 'titleOnly'` | The label style. |

  

Sets the style for labels within this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/labelstyle\(_:\)).

### `layoutPriority(priority)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `priority` | `number` | Layout priority value. |

  

Sets layout priority for the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/layoutpriority\(_:\)).

### `lineLimit(limit)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `limit`(optional) | `number` | The maximum number of lines. |

  

Sets the maximum number of lines that text can occupy in the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/linelimit\(_:\)).

### `lineSpacing(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `value` | `number` | The amount of space between the bottom of one line and the top of the next line in points. This value is always nonnegative. Otherwise, the default value will be used. |

  

The distance in points between the bottom of one line fragment and the top of the next.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/linespacing\(_:\)).

### `listRowBackground(color)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `color` | [Color](#color) | The row color (hex string). For example, `#FF0000`. |

  

Sets the background of a row.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/listrowbackground\(_:\)).

### `listRowInsets(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ bottom: number, leading: number, top: number, trailing: number }` | The inset to apply to the rows in a list. |

  

Applies an inset to the rows in a list.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/listrowinsets\(_:\)).

### `listRowSeparator(visibility, edges)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `visibility` | `'automatic' | 'visible' | 'hidden'` | The visibility to apply. |
| `edges`(optional) | `'top' | 'bottom' | 'all'` | The edges where the separator visibility applies. |

  

Controls the visibility of the separator for a list row.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/listrowseparator\(_:edges:\)).

### `listSectionMargins(params)`

Supported platforms: iOS 26+.

| Parameter | Type | Description |
| --- | --- | --- |
| `params`(optional) | `{ edges: 'top' | 'bottom' | 'vertical' | 'leading' | 'trailing' | 'horizontal' | 'all', length: number }` | The margins to apply to the section in a list. |

  

Allows a view to ignore safe area constraints.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/listsectionmargins\(_:_:\)).

### `listSectionSpacing(spacing)`

Supported platforms: iOS 17.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `spacing` | `number | 'default' | 'compact'` | The spacing to apply. |

  

Sets the spacing between adjacent sections.

Returns: `ModifierConfig`

### `listStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | [ListStyle](#liststyle) | The list style to apply. |

  

Sets the style for a List view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/liststyle\(_:\)).

### `luminanceToAlpha()`

Supported platforms: iOS, tvOS.

Adds a luminance to alpha effect to this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/luminanceToAlpha\(\)).

### `mask(shape, cornerRadius)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `shape` | `'circle' | 'ellipse' | 'roundedRectangle' | 'capsule' | 'rectangle'` | The masking shape. |
| `cornerRadius`(optional) | `number` | Corner radius for rounded rectangle (default: `8`). |

  

Applies a mask to the view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/mask\(_:\)).

### `matchedGeometryEffect(id, namespaceId)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The id of the view. |
| `namespaceId` | `string` | The namespace id of the view. Use Namespace component to create a namespace. |

  

Adds a matched geometry effect to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/matchedgeometryeffect\(id:in:properties:anchor:issource:\)).

### `menuActionDismissBehavior(behavior)`

Supported platforms: iOS 16.4+, tvOS 17.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `behavior` | `'automatic' | 'enabled' | 'disabled'` | The menu action dismiss behavior. |

  

Controls the dismissal behavior of menu actions.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/menuactiondismissbehavior\(_:\)).

### `monospacedDigit()`

Supported platforms: iOS, tvOS.

Modifies the fonts of all child views to use fixed-width digits, if possible, while leaving other characters proportionally spaced. When applied to `Text`, modifies the text view's font to use fixed-width digits, while leaving other characters proportionally spaced.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/monospaceddigit\(\)).

### `moveDisabled(disabled)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `disabled`(optional) | `boolean` | Whether moving should be disabled. Default: `true` |

  

Disables the move action for a view in a list. Apply to items within a `ForEach` to prevent them from being moved.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/movedisabled\(_:\)).

### `multilineTextAlignment(alignment)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `alignment` | `'center' | 'leading' | 'trailing'` | A value that you use to align multiple lines of text within a view. |

  

An alignment position for text along the horizontal axis.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/multilinetextalignment\(_:\)).

### `offset(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ x: number, y: number }` | The offset parameters: `x` and `y`. |

  

Applies an offset (translation) to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/offset\(x:y:\)).

### `onAppear(handler)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `handler` | `() => void` | Function to call when the view appears. |

  

Adds an onAppear modifier that calls a function when the view appears.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/onlongpressgesture\(minimumduration:perform:onpressingchanged:\)).

### `onDisappear(handler)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `handler` | `() => void` | Function to call when the view disappears. |

  

Adds an onDisappear modifier that calls a function when the view disappears.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/ondisappear\(perform:\)).

### `onLongPressGesture(handler, minimumDuration)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `handler` | `() => void` | Function to call when long pressed. |
| `minimumDuration`(optional) | `number` | Minimum duration for long press (default: 0.5s) |

  

Adds a long press gesture recognizer.

Returns: `ModifierConfig`

### `onTapGesture(handler)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `handler` | `() => void` | Function to call when tapped. |

  

Adds a tap gesture recognizer.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/ontapgesture\(count:perform:\)).

### `opacity(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `value` | `number` | Opacity value between 0 and 1. |

  

Sets the opacity of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/opacity\(_:\)).

### `overlay(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | { alignment: 'center' | 'top' | 'bottom' | 'leading' | 'trailing', color: [Color](#color) } | Overlay color and alignment. |

  

Overlays another view on top.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/overlay\(_:alignment:\)).

### `padding(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params`(optional) | `{ all: number, bottom: number, horizontal: number, leading: number, top: number, trailing: number, vertical: number }` | The padding parameters: `top`, `bottom`, `leading`, `trailing`, `horizontal`, `vertical` and `all`. |

  

Sets padding on a view. Supports individual edges or shorthand properties.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/padding\(_:_:\)).

### `pickerStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | [PickerStyleType](#pickerstyletype) | The style for the picker. |

  

Sets the style for the picker.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/pickerstyle).

### `presentationBackgroundInteraction(interaction)`

Supported platforms: iOS 16.4+, tvOS 16.4+.

| Parameter | Type | Description |
| --- | --- | --- |
| `interaction` | [PresentationBackgroundInteractionType](#presentationbackgroundinteractiontype) | The background interaction behavior. |

  

Controls interaction with the content behind a sheet.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/presentationbackgroundinteraction\(_:\)).

### `presentationDetents(detents, options)`

Supported platforms: iOS 16.0+, tvOS 16.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `detents` | [PresentationDetent[]](#presentationdetent) | Array of detents the sheet can snap to. |
| `options`(optional) | { onSelectionChange: (detent: [PresentationDetent](#presentationdetent)) => void, selection: [PresentationDetent](#presentationdetent) } | Optional settings for tracking the selected detent. |

  

Sets the available heights for a sheet presentation.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/presentationdetents\(_:selection:\)).

### `presentationDragIndicator(visibility)`

Supported platforms: iOS 16.0+, tvOS 16.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `visibility` | `'automatic' | 'visible' | 'hidden'` | The visibility of the drag indicator. |

  

Controls the visibility of the drag indicator on a sheet.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/presentationdragindicator\(_:\)).

### `progressViewStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | [ProgressViewStyleType](#progressviewstyletype) | The style for the progress view. |

  

Sets the style for the progress view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/progressviewstyle).

### `refreshable(handler)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `handler` | () => [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<void\> | Async function to call when refresh is triggered. |

  

Marks a view as refreshable. Adds pull-to-refresh functionality.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/refreshable\(action:\)).

### `resizable(capInsets, resizingMode)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `capInsets`(optional) | `{ bottom: number, leading: number, top: number, trailing: number }` | Inset values that indicate a portion of the image that SwiftUI doesn’t resize. |
| `resizingMode`(optional) | `'stretch' | 'tile'` | The mode by which SwiftUI resizes the image. |

  

Sets the mode by which SwiftUI resizes an image to fit its space.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/image/resizable\(capinsets:resizingmode:\)).

### `rotation3DEffect(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | `{ angle: number, axis: { x: number, y: number, z: number }, perspective: number }` | The rotation parameters: `angle` (in degrees), `axis` (x, y, z), and `perspective`. |

  

Applies a 3D rotation transformation.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/rotation3deffect\(_:axis:anchor:anchorz:perspective:\)).

### `rotationEffect(angle)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `angle` | `number` | Rotation angle in degrees. |

  

Applies rotation transformation.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/rotationeffect\(_:anchor:\)).

### `saturation(amount)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `amount` | `number` | Saturation multiplier (0 to infinity, 1 = normal). |

  

Adjusts the saturation of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/saturation\(_:\)).

### `scaleEffect(scale)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `scale` | `number | { x: number, y: number }` | Uniform scale factor (1.0 = normal size), or an object with separate `x` and `y` scale factors. |

  

Applies scaling transformation.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/scaleeffect\(_:anchor:\)).

### `scrollContentBackground(visible)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `visible` | `'automatic' | 'visible' | 'hidden'` | The visibility of the background. |

  

Specifies the visibility of the background for scrollable views within this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/scrollcontentbackground\(_:\)).

### `scrollDisabled(disabled)`

Supported platforms: iOS 16.0+, tvOS 16.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `disabled`(optional) | `boolean` | Whether scrolling should be disabled (default: true). Default: `true` |

  

Disables or enables scrolling in scrollable views.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/scrolldisabled\(_:\)).

### `scrollDismissesKeyboard(mode)`

Supported platforms: iOS 16.0+, tvOS 16.0+.

| Parameter | Type | Description |
| --- | --- | --- |
| `mode` | `'automatic' | 'never' | 'interactively' | 'immediately'` | The keyboard dismiss mode. |

  

Controls how the keyboard is dismissed when scrolling.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/scrolldismisseskeyboard\(_:\)).

### `shadow(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | { color: [Color](#color), radius: number, x: number, y: number } | The shadow parameters: `radius`, offset (`x`, `y`) and `color`. |

  

Adds a shadow to a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/shadow\(color:radius:x:y:\)).

### `strikethrough(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | { color: [Color](#color), isActive: boolean, pattern: LinePattern } | Controls whether the strikethrough is visible (`true` to show, `false` to hide). |

  

Applies a strikethrough to the text.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/text/strikethrough\(_:color:\)).

### `submitLabel(submitLabel)`

Supported platforms: iOS 15+.

| Parameter | Type | Description |
| --- | --- | --- |
| `submitLabel` | `'join' | 'search' | 'continue' | 'done' | 'go' | 'next' | 'return' | 'route' | 'send'` | The label to display in the keyboard's return key. |

  

Specifies the label to display in the keyboard's return key. For example, `'done'`.

Returns: `ModifierConfig`

A view that uses the specified submit label.

Example

```tsx
<TextField
  modifiers={[
    submitLabel('search'),
  ]}
/>
```

### `tag(tag)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `tag` | `string | number` | The tag to set on the view. |

  

Sets a tag on a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/tag\(_:includeoptional:\)).

### `textCase(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type |
| --- | --- |
| `value` | `'lowercase' | 'uppercase'` |

  

Sets a transform for the case of the text contained in this view when displayed.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/textcase\(_:\)).

### `textFieldStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | `'automatic' | 'plain' | 'roundedBorder'` | The text field style. |

  

Sets the text field style for text field views.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/textfieldstyle\(_:\)).

### `textSelection(value)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `value` | `boolean` | Enable selection |

  

Controls whether people can select text within this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/textselection\(_:\)).

### `tint(color)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `color` | [Color](#color) | The tint color (hex string). For example, `#FF0000`. |

  

Sets the tint color of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/tint\(_:\)).

### `toggleStyle(style)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `style` | `'button' | 'switch' | 'automatic'` | The toggle style. |

  

Sets the style for toggles within this view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/togglestyle\(_:\)).

### `truncationMode(mode)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `mode` | `'head' | 'middle' | 'tail'` | The truncation mode that specifies where to truncate the text within the text view, if needed. You can truncate at the beginning, middle, or end of the text view. |

  

Sets the truncation mode for lines of text that are too long to fit in the available space.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/truncationmode\(_:\)).

### `underline(params)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `params` | { color: [Color](#color), isActive: boolean, pattern: LinePattern } | Controls whether the underline is visible (`true` to show, `false` to hide). |

  

Applies an underline to the text.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/underline\(_:pattern:color:\)).

### `widgetAccentedRenderingMode(renderingMode)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `renderingMode` | `'fullColor' | 'accented' | 'desaturated' | 'accentedDesaturated'` | A constant describing how the Image should be rendered. |

  

Specifies the how to render an Image when using the WidgetKit/WidgetRenderingMode/accented mode.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/image/widgetaccentedrenderingmode\(_:\)).

### `widgetURL(url)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | `string` | The URL to open in the containing app. |

  

Sets the URL to open in the containing app when the user clicks the widget. Widgets support one widgetURL modifier in their view hierarchy. If multiple views have widgetURL modifiers, the behavior is undefined.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/SwiftUI/View/widgetURL\(_:\)).

### `zIndex(index)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `index` | `number` | The z-index value. |

  

Sets the z-index (display order) of a view.

Returns: `ModifierConfig`

> **See:** Official [SwiftUI documentation](https://developer.apple.com/documentation/swiftui/view/zindex\(_:\)).

## Event Subscriptions

### `createModifierWithEventListener(type, eventListener, params)`

Supported platforms: iOS, tvOS.

| Parameter | Type |
| --- | --- |
| `type` | `string` |
| `eventListener` | `(args: any) => void` |
| `params`(optional) | `Record<string, any>` |

  

Creates a modifier with an event listener.

Returns: `ModifierConfig`

### `createViewModifierEventListener(modifiers)`

Supported platforms: iOS, tvOS.

| Parameter | Type | Description |
| --- | --- | --- |
| `modifiers` | `ModifierConfig[]` | An array of modifier configs to extract event listeners from. |

  

Create an event listener for a view modifier.

Returns: `GlobalEvent`

## Interfaces

### `ModifierConfig`

Supported platforms: iOS, tvOS.

Base interface for all view modifiers. All modifiers must have a type field and can include arbitrary parameters.

| Property | Type | Description |
| --- | --- | --- |
| $type | `string` | - |
| eventListener(optional) | `(args: any) => void` | - |

## Types

### `ChainableAnimationType`

Supported platforms: iOS, tvOS.

| Property | Type | Description |
| --- | --- | --- |
| [VALUE_SYMBOL] | `() => AnimationObject` | - |
| delay | (delay: number) => [ChainableAnimationType](#chainableanimationtype) | Adds a delay before the animation starts (in seconds). |
| repeat | (params: { autoreverses: boolean, repeatCount: number }) => [ChainableAnimationType](#chainableanimationtype) | Repeats the animation the given number of times. |

### `Color`

Supported platforms: iOS, tvOS.

Literal Type: `union`

Acceptable values are: `string` | [ColorValue](https://reactnative.dev/docs/colors) | `NamedColor`

### `DatePickerStyleType`

Supported platforms: iOS, tvOS.

Literal Type: `string`

Acceptable values are: `'automatic'` | `'compact'` | `'graphical'` | `'wheel'`

### `EnvironmentConfig`

Supported platforms: iOS, tvOS.

Type: `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| key | `'editMode'` | - |
| value | `'active' | 'inactive' | 'transient'` | - |

Or `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| key | `'colorScheme'` | - |
| value | `'light' | 'dark'` | - |

Or `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| key | `'locale'` | - |
| value | `string` | - |

Or `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| key | `'timeZone'` | - |
| value | `string` | - |

### `GaugeStyleType`

Supported platforms: iOS, tvOS.

Literal Type: `string`

Acceptable values are: `'automatic'` | `'circular'` | `'circularCapacity'` | `'linear'` | `'linearCapacity'`

### `GlobalEvent`

Supported platforms: iOS, tvOS.

| Property | Type | Description |
| --- | --- | --- |
| onGlobalEvent | (event: { nativeEvent: [GlobalEventPayload](#globaleventpayload) }) => void | - |

### `GlobalEventPayload`

Supported platforms: iOS, tvOS.

| Property | Type | Description |
| --- | --- | --- |
| eventName[(index signature)](https://www.typescriptlang.org/docs/handbook/2/objects.html#index-signatures) | `Record<string, any>` | - |

### `InterpolatingSpringAnimationParams`

Supported platforms: iOS, tvOS.

| Property | Type | Description |
| --- | --- | --- |
| bounce(optional) | `number` | Extra bounce to apply to the spring animation. |
| damping(optional) | `number` | The damping applied to the spring. |
| duration(optional) | `number` | Total animation duration (in seconds). |
| initialVelocity(optional) | `number` | The initial velocity of the animation. |
| mass(optional) | `number` | The mass attached to the spring. |
| stiffness(optional) | `number` | The stiffness of the spring. |

### `ListStyle`

Supported platforms: iOS, tvOS.

Literal Type: `string`

Acceptable values are: `'automatic'` | `'plain'` | `'inset'` | `'insetGrouped'` | `'grouped'` | `'sidebar'`

### `PickerStyleType`

Supported platforms: iOS, tvOS.

Literal Type: `string`

Acceptable values are: `'automatic'` | `'inline'` | `'menu'` | `'navigationLink'` | `'palette'` | `'segmented'` | `'wheel'`

### `PresentationBackgroundInteractionType`

Supported platforms: iOS, tvOS.

Presentation background interaction type.

Type: `'automatic'` or `'enabled'` or `'disabled'` or `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| detent | [PresentationDetent](#presentationdetent) | - |
| type | `'enabledUpThrough'` | - |

### `PresentationDetent`

Supported platforms: iOS, tvOS.

Presentation detent type for controlling sheet heights.

-   `'medium'`: System medium height (approximately half screen)
-   `'large'`: System large height (full screen)
-   `{ fraction: number }`: Fraction of screen height (0-1, for example, 0.4 equals to 40% of screen)
-   `{ height: number }`: Fixed height in points

Type: `'medium'` or `'large'` or `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| fraction | `number` | - |

Or `object` shaped as below:

| Property | Type | Description |
| --- | --- | --- |
| height | `number` | - |

### `ProgressViewStyleType`

Supported platforms: iOS, tvOS.

Literal Type: `string`

Acceptable values are: `'automatic'` | `'linear'` | `'circular'`

### `Shape`

Supported platforms: iOS, tvOS.

Literal Type: `ReturnType`

Acceptable values are: `ReturnType<shapes.roundedRectangle>` | `ReturnType<shapes.capsule>` | `ReturnType<shapes.rectangle>` | `ReturnType<shapes.ellipse>` | `ReturnType<shapes.circle>`

### `SpringAnimationParams`

Supported platforms: iOS, tvOS.

| Property | Type | Description |
| --- | --- | --- |
| blendDuration(optional) | `number` | The duration over which to blend between animations (in seconds). |
| bounce(optional) | `number` | Extra bounce to apply to the spring animation. |
| dampingFraction(optional) | `number` | The amount of damping applied to the spring's motion. |
| duration(optional) | `number` | Total animation duration (in seconds). |
| response(optional) | `number` | The spring's response time (in seconds). |

### `TimingAnimationParams`

Supported platforms: iOS, tvOS.

| Property | Type | Description |
| --- | --- | --- |
| duration(optional) | `number` | Total animation duration (in seconds). |
