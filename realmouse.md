# Real Mouse Cursor Behavior (Human-Like Simulation)

## Overview
A real mouse cursor does not move linearly or perfectly. It reflects human motor behavior with imperfections, acceleration, and micro-adjustments. This document defines the key principles required to simulate realistic cursor movement.

---

## 1. Non-Linear Movement (Curved Paths)
- Cursor movement is not a straight line.
- Typically follows a **slight curve** (Bezier-like path).
- Includes small directional corrections during movement.

**Implementation Notes:**
- Use quadratic or cubic Bezier curves.
- Randomize control points slightly.

---

## 2. Acceleration & Deceleration
- Movement follows a velocity curve:
  - Slow start (ease-in)
  - Fast middle
  - Slow end (ease-out)

**Implementation Notes:**
- Use easing functions:
  - `easeInOutCubic`
  - `easeInOutQuad`
- Avoid constant velocity.

---

## 3. Mouse Acceleration (Dynamic Sensitivity)
- Faster physical movement → larger cursor movement.
- Slower movement → more precise control.

**Implementation Notes:**
- Scale velocity based on distance:
  - Long distance → faster speed
  - Short distance → slower speed

---

## 4. Micro Jitter (Hand Tremor Simulation)
- Small random movement exists even during precision.
- Cursor never stays perfectly stable during motion.

**Implementation Notes:**
- Add random noise:
  - Range: ±1–3px
  - Frequency: low but continuous
- Reduce jitter near final target.

---

## 5. Overshooting Behavior
- Cursor may pass the target slightly.
- Then corrects back to the exact position.

**Implementation Notes:**
- Add overshoot probability (~30–50%)
- Overshoot distance: 5–15px
- Follow with correction animation.

---

## 6. Target-Based Deceleration (Fitts's Law)
- Cursor slows down as it approaches a target.
- Smaller targets → slower approach speed.

**Implementation Notes:**
- Reduce velocity within last 20–30% of path.
- Increase precision (reduce jitter).

---

## 7. Pre-Click Pause
- Cursor pauses briefly before clicking.

**Implementation Notes:**
- Add delay: 50–150ms before click event.
- Ensure cursor is stable (no jitter spike).

---

## 8. Variable Speed per Movement
- Movement speed is inconsistent.
- Depends on distance and context.

**Implementation Notes:**
- Randomize duration:
  - Short distance: 200–400ms
  - Long distance: 500–1200ms

---

## 9. Timing Imperfection
- Human movement timing is not uniform.

**Implementation Notes:**
- Add slight randomness to duration (±10–20%)
- Avoid fixed animation timing.

---

## 10. Mid-Path Corrections
- Cursor may slightly change direction mid-way.

**Implementation Notes:**
- Slightly perturb path during animation.
- Introduce small angular deviations.

---

# Recommended Implementation Stack

## Core Components
- Bezier Path Generator
- Easing Function Engine
- Noise Generator (Jitter)
- Overshoot Handler
- Click Timing Controller

---

# Example Behavior Flow

1. Generate curved path
2. Apply easing (acceleration curve)
3. Add jitter during movement
4. Optionally overshoot target
5. Correct back to target
6. Stabilize cursor
7. Pause briefly
8. Trigger click

---

# Key Principle

> A real cursor feels imperfect, adaptive, and slightly unstable — becoming precise only at the final moment.

---

# Anti-Patterns (Avoid These)

- ❌ Perfect straight-line movement  
- ❌ Constant speed  
- ❌ Instant click after movement  
- ❌ No jitter or randomness  
- ❌ Fixed timing for all movements  

---

# Goal

To create cursor motion that feels:
- Human
- Organic
- Slightly unpredictable
- Visually believable in UI demonstrations

---