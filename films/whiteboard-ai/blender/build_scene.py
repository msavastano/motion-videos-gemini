"""From Neuron to Transformer: Blender RGBA hand, dry-erase marker, and eraser sprite library.

Builds a 96-frame (4 x 24-frame banks) 1024x1024 EEVEE scene with transparent alpha:
  - Frames  1..24: grip   (cap pops off dry-erase marker, hand settles into writing grip)
  - Frames 25..48: draw   (continuous 24-frame writing micro-motion loop)
  - Frames 49..72: lift   (hand + marker lift off the board and return)
  - Frames 73..96: eraser (ergonomic felt whiteboard eraser scrub loop)

Exports normalized 2D screen-space tip/eraser anchors to ../prep/hand_anchors.json
so the HTML/JS whiteboard canvas locks dry-erase strokes pixel-for-pixel to the marker tip.

Run headless:
    blender -b --factory-startup --python blender/build_scene.py -- "<abs>/blender/scene.blend"
"""
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:/Users/millh/Local Documents/dev/motion-videos-gemini/films/whiteboard-ai/blender"
FILM_DIR = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import assets  # noqa: E402

FPS = 24
FRAMES = 96
RES = (1600, 1200)


def gen(name):
    col = assets.collection(f"GEN_{name}")
    for o in list(col.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    return col


def link(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def set_input(node, names, val):
    for name in names:
        if name in node.inputs:
            node.inputs[name].default_value = val
            return True
    return False


def make_mat(name, base_color, roughness=0.45, metallic=0.0, subsurface=0.0, sss_radius=None, coat=0.0, bump_scale=0.0, bump_dist=0.0005):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    set_input(bsdf, ("Base Color",), base_color)
    set_input(bsdf, ("Roughness",), roughness)
    set_input(bsdf, ("Metallic",), metallic)
    set_input(bsdf, ("Subsurface Weight", "Subsurface"), subsurface)
    if subsurface > 0:
        set_input(bsdf, ("Subsurface Scale",), 0.012)
        if sss_radius:
            set_input(bsdf, ("Subsurface Radius",), sss_radius)
    set_input(bsdf, ("Coat Weight", "Clearcoat"), coat)
    if bump_scale > 0:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = bump_scale
        nz.inputs["Detail"].default_value = 6.0
        nz.inputs["Roughness"].default_value = 0.65
        bmp = nt.nodes.new("ShaderNodeBump")
        bmp.inputs["Strength"].default_value = 0.16
        bmp.inputs["Distance"].default_value = bump_dist
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], bmp.inputs["Height"])
        nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------- scene settings
sc = bpy.context.scene
for name, kind in (("Cube", "MESH"), ("Light", "LIGHT"), ("Camera", "CAMERA")):
    o = bpy.data.objects.get(name)
    if o and o.type == kind and not o.get("keep"):
        bpy.data.objects.remove(o, do_unlink=True)

sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, FRAMES
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.film_transparent = True
for name in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        sc.render.engine = name
        break
    except TypeError:
        continue
try:
    sc.view_settings.view_transform = "AgX"
except TypeError:
    pass

# ---------------------------------------------------------------- append BlenderKit models
REG = assets.registry()
assets.append_model("hand", REG)
assets.append_model("marker", REG)
bpy.context.view_layer.update()
print(assets.shrink_images(reg=REG))

for o in bpy.data.collections["marker"].all_objects:
    if "Cutter" in o.name:
        o.hide_render = True
        o.hide_viewport = True

# ---------------------------------------------------------------- clean right-hand mesh + sleeve + rig
HAND_COL = gen("hand")

src_hand = bpy.data.objects["Stylized_Male_Hand"]
src_hand.hide_render = True
src_hand.hide_viewport = True

# Build a clean mirrored (right-hand) mesh with world transforms baked in
hand_mesh = src_hand.data.copy()
hand_mesh.name = "RightHandMesh"
mw = src_hand.matrix_world.copy()
for v in hand_mesh.vertices:
    p = mw @ v.co
    p.x = -p.x  # mirror left hand -> right hand (Thumb on -X, Pinky on +X)
    v.co = p
bm = bmesh.new()
bm.from_mesh(hand_mesh)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(hand_mesh)
bm.free()

hand_obj = bpy.data.objects.new("RightHand", hand_mesh)
HAND_COL.objects.link(hand_obj)
for p in hand_obj.data.polygons:
    p.use_smooth = True

# Realistic warm skin + nail materials
skin_mat = make_mat(
    "SkinRealistic",
    base_color=(0.56, 0.33, 0.23, 1.0),
    roughness=0.44,
    subsurface=0.14,
    sss_radius=(1.0, 0.35, 0.22),
    bump_scale=240.0,
    bump_dist=0.0003,
)
nail_mat = make_mat(
    "NailRealistic",
    base_color=(0.76, 0.56, 0.50, 1.0),
    roughness=0.26,
    subsurface=0.06,
    coat=0.35,
)
hand_obj.data.materials.clear()
hand_obj.data.materials.append(skin_mat)
hand_obj.data.materials.append(nail_mat)

sub = hand_obj.modifiers.new("Subsurf", "SUBSURF")
sub.levels = 2
sub.render_levels = 2

# Measure exact wrist rim of RightHand to fit a snug sleeve cuff
wrist_pts = [v.co for v in hand_mesh.vertices if v.co.y < -0.095]
wrist_cx = sum(p.x for p in wrist_pts) / len(wrist_pts)
wrist_cz = sum(p.z for p in wrist_pts) / len(wrist_pts)
wrist_rx = (max(p.x for p in wrist_pts) - min(p.x for p in wrist_pts)) * 0.46
wrist_rz = (max(p.z for p in wrist_pts) - min(p.z for p in wrist_pts)) * 0.48

bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=1.0, depth=1.20, location=(wrist_cx, -0.64, wrist_cz), rotation=(math.radians(90), 0, 0))
sleeve_obj = link(bpy.context.active_object, HAND_COL)
sleeve_obj.name = "ForearmSleeve"
for v in sleeve_obj.data.vertices:
    t = (v.co.z + 0.60) / 1.20  # 0 at far forearm, 1 at wrist cuff (y ~ -0.04)
    taper = 1.32 - 0.18 * t
    v.co.x *= wrist_rx * 1.28 * taper
    v.co.y *= wrist_rz * 1.32 * taper
bev_s = sleeve_obj.modifiers.new("Bevel", "BEVEL")
bev_s.width = 0.002
bev_s.segments = 2
for p in sleeve_obj.data.polygons:
    p.use_smooth = True
sleeve_obj.data.materials.append(make_mat("SleeveSlate", base_color=(0.08, 0.11, 0.16, 1.0), roughness=0.86, bump_scale=180.0, bump_dist=0.0005))

# Build 16-bone hand armature (right hand, mirrored coordinates)
arm_data = bpy.data.armatures.new("HandRigData")
arm_obj = bpy.data.objects.new("HandRig", arm_data)
HAND_COL.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="EDIT")

BONES = {
    "Palm":      ((0.0, -0.105, 0.033), (0.0, 0.030, 0.040), None),
    "Thumb.1":   ((-0.038, -0.042, 0.034), (-0.068, -0.015, 0.024), "Palm"),
    "Thumb.2":   ((-0.068, -0.015, 0.024), (-0.092, 0.004, 0.015), "Thumb.1"),
    "Thumb.3":   ((-0.092, 0.004, 0.015), (-0.108, 0.016, 0.014), "Thumb.2"),
    "Index.1":   ((-0.036, 0.036, 0.049), (-0.041, 0.075, 0.055), "Palm"),
    "Index.2":   ((-0.041, 0.075, 0.055), (-0.045, 0.102, 0.054), "Index.1"),
    "Index.3":   ((-0.045, 0.102, 0.054), (-0.049, 0.125, 0.054), "Index.2"),
    "Middle.1":  ((0.000, 0.042, 0.047), (0.000, 0.088, 0.048), "Palm"),
    "Middle.2":  ((0.000, 0.088, 0.048), (-0.001, 0.115, 0.049), "Middle.1"),
    "Middle.3":  ((-0.001, 0.115, 0.049), (-0.001, 0.140, 0.049), "Middle.2"),
    "Ring.1":    ((0.034, 0.038, 0.040), (0.037, 0.078, 0.038), "Palm"),
    "Ring.2":    ((0.037, 0.078, 0.038), (0.039, 0.105, 0.036), "Ring.1"),
    "Ring.3":    ((0.039, 0.105, 0.036), (0.041, 0.126, 0.035), "Ring.2"),
    "Pinky.1":   ((0.062, 0.028, 0.028), (0.070, 0.062, 0.022), "Palm"),
    "Pinky.2":   ((0.070, 0.062, 0.022), (0.075, 0.084, 0.017), "Pinky.1"),
    "Pinky.3":   ((0.075, 0.084, 0.017), (0.079, 0.102, 0.015), "Pinky.2"),
}

eb = arm_data.edit_bones
for bname, (head, tail, parent) in BONES.items():
    b = eb.new(bname)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = bname.endswith(".2") or bname.endswith(".3")
    b.align_roll(Vector((0, 0, 1)))

bpy.ops.object.mode_set(mode="OBJECT")


def dist_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-8, ab.length_squared)))
    return (p - (a + ab * t)).length


def classify_finger(p):
    if p.x < -0.032 and p.y < 0.046:
        return "Thumb"
    if p.y < 0.030:
        return "Palm"
    if p.x < -0.019:
        return "Index"
    if p.x < 0.019:
        return "Middle"
    if p.x < 0.053:
        return "Ring"
    return "Pinky"


vgroups = {bname: hand_obj.vertex_groups.new(name=bname) for bname in BONES}
for v in hand_obj.data.vertices:
    p = v.co
    grp = classify_finger(p)
    if grp == "Palm":
        candidates = ["Palm", "Thumb.1"] if p.x < -0.015 and p.y > -0.065 else ["Palm"]
    elif grp == "Thumb":
        candidates = ["Palm", "Thumb.1", "Thumb.2", "Thumb.3"]
    else:
        candidates = [f"{grp}.1", f"{grp}.2", f"{grp}.3"]
        if p.y < 0.060:
            candidates.append("Palm")
    weights = {}
    for bname in candidates:
        a, b, _ = BONES[bname]
        d = dist_to_segment(p, Vector(a), Vector(b))
        weights[bname] = math.exp(-(d / 0.020) ** 2)
    tot = sum(weights.values()) or 1.0
    for bname, w in weights.items():
        vgroups[bname].add([v.index], w / tot, "REPLACE")

hand_obj.parent = arm_obj
arm_mod = hand_obj.modifiers.new("Armature", "ARMATURE")
arm_mod.object = arm_obj
# Put Smooth after Armature and before Subsurf to eliminate web creasing
hand_obj.modifiers.remove(sub)
sm_mod = hand_obj.modifiers.new("Smooth", "SMOOTH")
sm_mod.factor = 0.45
sm_mod.iterations = 3
sub2 = hand_obj.modifiers.new("Subsurf", "SUBSURF")
sub2.levels = 2
sub2.render_levels = 2

# Parent sleeve directly to arm_obj (at rest Palm aligns with world origin)
sleeve_obj.parent = arm_obj

# Pose fingers into natural tripod writing grip
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="POSE")
pb = arm_obj.pose.bones
for b in pb:
    b.rotation_mode = "XYZ"

POSE_EULER = {
    # Thumb rests gently along left-lower side of marker barrel
    "Thumb.1":  (10, 4, -18),
    "Thumb.2":  (8, 0, -10),
    "Thumb.3":  (6, 0, -4),
    # Index rests along top-front of barrel cleanly behind nib
    "Index.1":  (-42, 0, 2),
    "Index.2":  (-34, 0, 0),
    "Index.3":  (-16, 0, 0),
    # Middle cradles underneath barrel
    "Middle.1": (-60, -4, 4),
    "Middle.2": (-48, 0, 0),
    "Middle.3": (-22, 0, 0),
    # Ring & Pinky tuck naturally toward palm/board
    "Ring.1":   (-78, -6, 8),
    "Ring.2":   (-70, 0, 0),
    "Ring.3":   (-30, 0, 0),
    "Pinky.1":  (-88, -8, 10),
    "Pinky.2":  (-78, 0, 0),
    "Pinky.3":  (-34, 0, 0),
}
for bname, degs in POSE_EULER.items():
    pb[bname].rotation_euler = tuple(math.radians(d) for d in degs)

bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- marker & cap setup
marker_obj = bpy.data.objects["marker red"]
cap_obj = bpy.data.objects["cap"]
marker_root = bpy.data.objects["Red whiteboard marker"]

charcoal_mat = make_mat("MarkerCharcoal", base_color=(0.045, 0.055, 0.08, 1.0), roughness=0.30, coat=0.25)
barrel_mat = make_mat("MarkerBarrel", base_color=(0.88, 0.89, 0.91, 1.0), roughness=0.26, coat=0.32)
tip_mat = make_mat("MarkerFeltTip", base_color=(0.02, 0.025, 0.035, 1.0), roughness=0.85)

for idx, m in enumerate(list(marker_obj.data.materials)):
    if m and "Tip" in m.name:
        marker_obj.data.materials[idx] = tip_mat
    elif m and "Print" in m.name:
        marker_obj.data.materials[idx] = barrel_mat
    else:
        marker_obj.data.materials[idx] = charcoal_mat
for idx in range(len(cap_obj.data.materials)):
    cap_obj.data.materials[idx] = charcoal_mat

MARKER_PIVOT = bpy.data.objects.new("MarkerPivot", None)
HAND_COL.objects.link(MARKER_PIVOT)

# In marker's rest file, felt tip is at local x=-0.123, z=+0.0082, barrel extends toward x=0
marker_root.parent = MARKER_PIVOT
marker_root.location = (0.123, 0.0, -0.0082)
marker_root.rotation_euler = (0.0, 0.0, 0.0)

# Orient MARKER_PIVOT so local +X (marker barrel) points along barrel_dir: up-right-back into hand web
barrel_dir = Vector((0.58, -0.52, 0.63)).normalized()
q_barrel = Vector((1.0, 0.0, 0.0)).rotation_difference(barrel_dir)
MARKER_PIVOT.location = (0.0, 0.0, 0.0)
MARKER_PIVOT.rotation_euler = q_barrel.to_euler()
MARKER_PIVOT.scale = (1.14, 1.14, 1.14)

# Orient HandRig with natural right-hand pronation (+Y roll tilts thumb up-left, pinky down toward board)
arm_obj.rotation_euler = (math.radians(-14), math.radians(22), math.radians(44))
bpy.context.view_layer.update()

# Snap HandRig so Index.3.tail + Thumb.3.tail midpoint sits on marker barrel 5.6 cm behind nib (nib & nose completely clear)
idx_tip = arm_obj.matrix_world @ pb["Index.3"].tail
thm_tip = arm_obj.matrix_world @ pb["Thumb.3"].tail
pinch_mid = (idx_tip + thm_tip) * 0.5
barrel_grip = barrel_dir * 0.054 + Vector((0.005, 0.005, -0.005))
arm_obj.location = arm_obj.location + (barrel_grip - pinch_mid)
bpy.context.view_layer.update()

# Master parent moving hand + marker together
HAND_MASTER = bpy.data.objects.new("HandMaster", None)
HAND_COL.objects.link(HAND_MASTER)
arm_obj.parent = HAND_MASTER
MARKER_PIVOT.parent = HAND_MASTER

TIP_ANCHOR = bpy.data.objects.new("Anchor.tip", None)
HAND_COL.objects.link(TIP_ANCHOR)
TIP_ANCHOR.parent = MARKER_PIVOT
TIP_ANCHOR.location = (0.0, 0.0, 0.0)

# ---------------------------------------------------------------- procedural felt whiteboard eraser (frames 73-96)
ERASER_COL = gen("eraser")
ERASER_ROOT = bpy.data.objects.new("EraserRoot", None)
ERASER_COL.objects.link(ERASER_ROOT)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.023))
er_body = link(bpy.context.active_object, ERASER_COL)
er_body.name = "EraserBody"
er_body.scale = (0.135, 0.054, 0.026)
bpy.ops.object.transform_apply(scale=True)
bev = er_body.modifiers.new("Bevel", "BEVEL")
bev.width = 0.006
bev.segments = 4
for p in er_body.data.polygons:
    p.use_smooth = True
er_body.data.materials.append(make_mat("EraserPlastic", base_color=(0.06, 0.13, 0.28, 1.0), roughness=0.35, coat=0.25))
er_body.parent = ERASER_ROOT

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.006))
er_felt = link(bpy.context.active_object, ERASER_COL)
er_felt.name = "EraserFelt"
er_felt.scale = (0.132, 0.052, 0.012)
bpy.ops.object.transform_apply(scale=True)
bev2 = er_felt.modifiers.new("Bevel", "BEVEL")
bev2.width = 0.002
bev2.segments = 2
er_felt.data.materials.append(make_mat("EraserFeltMat", base_color=(0.035, 0.04, 0.05, 1.0), roughness=0.95, bump_scale=350.0, bump_dist=0.0008))
er_felt.parent = ERASER_ROOT

ERASER_ANCHOR = bpy.data.objects.new("Anchor.eraser", None)
ERASER_COL.objects.link(ERASER_ANCHOR)
ERASER_ANCHOR.parent = ERASER_ROOT
ERASER_ANCHOR.location = (0.0, 0.0, 0.0)

ERASER_ROOT.rotation_euler = (math.radians(4), math.radians(-6), math.radians(14))

# ---------------------------------------------------------------- lighting (overhead studio + board bounce)
LIGHTS = gen("lights")


def add_area(name, loc, target_loc, energy, size, color=(1.0, 1.0, 1.0)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    ld.color = color
    lo = bpy.data.objects.new(name, ld)
    LIGHTS.objects.link(lo)
    lo.location = loc
    d = Vector(target_loc) - Vector(loc)
    lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return lo


# Overhead-left key light (wide enough to illuminate entire forearm evenly without shadow cutoff)
add_area("KeyLight", (-0.28, 0.12, 1.15), (0.14, -0.14, 0.02), energy=54.0, size=1.80, color=(1.0, 0.97, 0.94))
# Subtle whiteboard bounce fill from underneath (-Z)
add_area("BoardBounce", (0.12, -0.12, -0.55), (0.12, -0.12, 0.04), energy=7.5, size=1.60, color=(0.95, 0.97, 1.0))
# Cool studio rim light from upper-right
add_area("RimLight", (0.65, -0.30, 0.72), (0.12, -0.12, 0.02), energy=18.0, size=1.20, color=(0.92, 0.96, 1.0))

# ---------------------------------------------------------------- camera (overhead slight angle)
CAM = gen("camera")
cam_data = bpy.data.cameras.new("MainCamera")
cam_data.lens = 28.0
cam = bpy.data.objects.new("MainCamera", cam_data)
CAM.objects.link(cam)
cam.location = (0.42, -0.50, 1.05)
cam_target = bpy.data.objects.new("CameraTarget", None)
CAM.objects.link(cam_target)
cam_target.location = (0.41, -0.32, 0.02)
trk = cam.constraints.new("TRACK_TO")
trk.target, trk.track_axis, trk.up_axis = cam_target, "TRACK_NEGATIVE_Z", "UP_Y"
sc.camera = cam

# ---------------------------------------------------------------- animation banks (frames 1..96)
def key_vis(objs, frame, show):
    for o in objs:
        o.hide_render = not show
        o.hide_viewport = not show
        o.keyframe_insert("hide_render", frame=frame)
        o.keyframe_insert("hide_viewport", frame=frame)


hand_vis_objs = [hand_obj, sleeve_obj, marker_obj]
eraser_vis_objs = [er_body, er_felt]

key_vis(hand_vis_objs, 1, True)
key_vis([cap_obj], 1, True)
key_vis(eraser_vis_objs, 1, False)

key_vis([cap_obj], 24, True)
key_vis([cap_obj], 25, False)

key_vis(hand_vis_objs, 72, True)
key_vis(eraser_vis_objs, 72, False)
key_vis(hand_vis_objs, 73, False)
key_vis(eraser_vis_objs, 73, True)

# Bank 1 (1..24): grip — cap seated on tip (f1..f4), pops/slides off along -X of marker (f5..f18)
cap_rest = Vector((-0.071, 0.0, 0.0))
for f, dx, dz, hand_z in [
    (1,   0.000, 0.000, 0.012),
    (4,  -0.006, 0.000, 0.012),
    (10, -0.055, 0.012, 0.008),
    (18, -0.150, 0.055, 0.002),
    (24, -0.240, 0.110, 0.000),
]:
    cap_obj.location = cap_rest + Vector((dx, 0.0, dz))
    cap_obj.keyframe_insert("location", frame=f)
    HAND_MASTER.location = (0.0, 0.0, hand_z)
    HAND_MASTER.keyframe_insert("location", frame=f)

# Bank 2 (25..48): draw — seamless 24-frame subtle writing cadence loop
for f in range(25, 49):
    ph = (f - 25) / 24.0 * 2.0 * math.pi
    HAND_MASTER.location = (0.0, 0.0, 0.0008 * (1.0 - math.cos(ph)))
    HAND_MASTER.rotation_euler = (
        math.radians(1.4 * math.sin(ph)),
        math.radians(1.8 * math.sin(ph * 2.0)),
        math.radians(1.2 * math.cos(ph)),
    )
    HAND_MASTER.keyframe_insert("location", frame=f)
    HAND_MASTER.keyframe_insert("rotation_euler", frame=f)

# Bank 3 (49..72): lift — smooth lift off board & tilt back (peak at f60)
for f, lz, rx, ry in [
    (49, 0.000, 0.0, 0.0),
    (55, 0.032, 4.5, -2.5),
    (60, 0.056, 8.0, -4.0),
    (66, 0.030, 4.0, -2.0),
    (72, 0.000, 0.0, 0.0),
]:
    HAND_MASTER.location = (0.0, 0.0, lz)
    HAND_MASTER.rotation_euler = (math.radians(rx), math.radians(ry), 0.0)
    HAND_MASTER.keyframe_insert("location", frame=f)
    HAND_MASTER.keyframe_insert("rotation_euler", frame=f)

# Bank 4 (73..96): eraser — subtle 24-frame scrub tilt loop
for f in range(73, 97):
    ph = (f - 73) / 24.0 * 2.0 * math.pi
    ERASER_ROOT.location = (0.004 * math.sin(ph), 0.003 * math.cos(ph), 0.0)
    ERASER_ROOT.rotation_euler = (
        math.radians(4.0 + 2.2 * math.sin(ph)),
        math.radians(-6.0 + 2.5 * math.cos(ph)),
        math.radians(14.0 + 3.0 * math.sin(ph)),
    )
    ERASER_ROOT.keyframe_insert("location", frame=f)
    ERASER_ROOT.keyframe_insert("rotation_euler", frame=f)

# ---------------------------------------------------------------- export screen anchors per frame
anchors = {
    "width": RES[0],
    "height": RES[1],
    "fps": FPS,
    "banks": {
        "grip": [1, 24],
        "draw": [25, 48],
        "lift": [49, 72],
        "eraser": [73, 96],
    },
    "tip": {},
    "eraser": {},
}
for f in range(1, FRAMES + 1):
    sc.frame_set(f)
    if f <= 72:
        p = world_to_camera_view(sc, cam, TIP_ANCHOR.matrix_world.translation)
        anchors["tip"][str(f)] = [round(p.x, 5), round(1.0 - p.y, 5), round(p.z, 4)]
    else:
        p = world_to_camera_view(sc, cam, ERASER_ANCHOR.matrix_world.translation)
        anchors["eraser"][str(f)] = [round(p.x, 5), round(1.0 - p.y, 5), round(p.z, 4)]

os.makedirs(os.path.join(FILM_DIR, "prep"), exist_ok=True)
anchors_path = os.path.join(FILM_DIR, "prep", "hand_anchors.json")
with open(anchors_path, "w", encoding="utf-8") as fp:
    json.dump(anchors, fp, indent=2)
print("Exported anchors:", anchors_path, "sample f32 tip:", anchors["tip"]["32"], "f84 eraser:", anchors["eraser"]["84"])

if "--" in sys.argv:
    out_blend = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
    os.makedirs(os.path.dirname(out_blend), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_blend)
    print("Saved:", out_blend)
