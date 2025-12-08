import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import nipplejs from 'nipplejs';

export class Player {
    constructor(scene, camera, domElement, world, portalSystem) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.world = world;
        this.portalSystem = portalSystem;

        // Physics
        this.playerVelocity = new THREE.Vector3();
        this.playerDirection = new THREE.Vector3();
        this.playerOnFloor = false;
        this.gravity = 30;

        // Capsule: radius 0.35, length 1 (total height 1.7)
        this.playerCollider = new Capsule(
            new THREE.Vector3(0, 0.35, 0),
            new THREE.Vector3(0, 1.35, 0),
            0.35
        );

        // Input State
        this.keyStates = {};
        this.moveInput = { x: 0, y: 0 }; // From WASD or Joystick
        this.lookInput = { x: 0, y: 0 }; // From Mouse or Touch Drag

        // Camera State
        this.pitch = 0;
        this.yaw = 0;

        this.initInput();
        this.initMobileControls();
    }

    initInput() {
        document.addEventListener('keydown', (event) => {
            this.keyStates[event.code] = true;
            if(event.code === 'Space') this.jump();
        });
        document.addEventListener('keyup', (event) => {
            this.keyStates[event.code] = false;
        });

        // Mouse Look
        document.body.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === document.body) {
                this.yaw -= event.movementX * 0.002;
                this.pitch -= event.movementY * 0.002;
                this.clampPitch();
            }
        });

        document.addEventListener('mousedown', (event) => {
            if (this.isMobile()) return;

            if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            } else {
                if (event.button === 0) {
                    this.shootPortal('blue');
                } else if (event.button === 2) {
                    this.shootPortal('orange');
                }
            }
        }); 
        
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    isMobile() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    initMobileControls() {
        if (!this.isMobile()) return;

        const mobileControls = document.getElementById('mobile-controls');
        mobileControls.style.display = 'block';
        document.getElementById('instructions').style.display = 'none';

        // Joystick (Left)
        const zoneMove = document.getElementById('zone-move');
        const joystickManager = nipplejs.create({
            zone: zoneMove,
            mode: 'static', 
            position: { left: '50%', top: '50%' },
            color: 'white'
        });

        joystickManager.on('move', (evt, data) => {
            const forward = data.vector.y;
            const turn = data.vector.x;
            this.moveInput.x = turn;
            this.moveInput.y = forward;
        });

        joystickManager.on('end', () => {
            this.moveInput.x = 0;
            this.moveInput.y = 0;
        });

        // Touch Look (Right)
        const zoneLook = document.getElementById('zone-look');
        let lastTouchX = 0;
        let lastTouchY = 0;

        zoneLook.addEventListener('touchstart', (e) => {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }, {passive: false});

        zoneLook.addEventListener('touchmove', (e) => {
            e.preventDefault(); 
            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            
            const deltaX = touchX - lastTouchX;
            const deltaY = touchY - lastTouchY;
            
            this.yaw -= deltaX * 0.005;
            this.pitch -= deltaY * 0.005;
            this.clampPitch();

            lastTouchX = touchX;
            lastTouchY = touchY;
        }, {passive: false});

        // Buttons
        document.getElementById('btn-blue').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.shootPortal('blue');
        });
        document.getElementById('btn-orange').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.shootPortal('orange');
        });
    }

    clampPitch() {
        this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    }

    jump() {
        if (this.playerOnFloor) {
            this.playerVelocity.y = 10;
        }
    }

    shootPortal(type) {
        // Raycast from camera center
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        // Get walls from world
        const intersects = raycaster.intersectObjects(this.world.getColliders());
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.object.userData.isWall) {
                // Play Sound
                const audio = new Audio('portal_shoot.mp3');
                audio.volume = 0.3;
                audio.play().catch(()=>{});

                // Calculate world normal from object space face normal
                const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();

                this.portalSystem.placePortal(type, hit.point, worldNormal, hit.object);
            }
        }
    }

    update(deltaTime) {
        // Process Input
        let speed = 15; // Ground speed
        if (!this.playerOnFloor) speed = 8; // Air control

        // Reset delta move
        const moveVector = new THREE.Vector3();

        if (this.isMobile()) {
            moveVector.z = this.moveInput.y;
            moveVector.x = this.moveInput.x;
        } else {
            if (this.keyStates['KeyW']) moveVector.z = 1;
            if (this.keyStates['KeyS']) moveVector.z = -1;
            if (this.keyStates['KeyA']) moveVector.x = -1;
            if (this.keyStates['KeyD']) moveVector.x = 1;
        }

        moveVector.normalize(); 
        
        // Get forward/right vectors flattened to XZ plane
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));

        // Apply input to velocity (with damping)
        const damping = Math.exp(-4 * deltaTime) - 1;
        if (this.playerOnFloor) {
            this.playerVelocity.addScaledVector(this.playerVelocity, damping);
        } else {
             this.playerVelocity.addScaledVector(this.playerVelocity, damping * 0.1); // Less drag in air
        }

        const inputAccel = forward.multiplyScalar(moveVector.z).add(right.multiplyScalar(moveVector.x)).multiplyScalar(speed * deltaTime * 5);
        this.playerVelocity.add(inputAccel);

        // Gravity
        this.playerVelocity.y -= this.gravity * deltaTime;

        // Capture start position before move
        const startPos = new THREE.Vector3();
        this.playerCollider.getCenter(startPos);

        // Apply Velocity
        const deltaPosition = this.playerVelocity.clone().multiplyScalar(deltaTime);
        this.playerCollider.translate(deltaPosition);

        // Capture end position after move
        const endPos = new THREE.Vector3();
        this.playerCollider.getCenter(endPos);

        // Check Portal Teleport
        const teleportRotDelta = this.portalSystem.checkTeleport(this.playerCollider, startPos, endPos, this.playerVelocity);
        
        if (teleportRotDelta) {
            // Adjust Yaw based on quaternion delta
            const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0));
            direction.applyQuaternion(teleportRotDelta);
            
            // Extract new yaw from direction
            const newYaw = Math.atan2(-direction.x, -direction.z);
            this.yaw = newYaw;
            
            // Re-sync camera
            this.updateCamera();
            return; // Skip collision this frame
        }

        // Collision with World
        this.playerOnFloor = false;
        this.collisionDetection(deltaTime);

        // Update Camera
        this.updateCamera();
    }

    collisionDetection(dt) {
        const colliders = this.world.getColliders();
        
        const pPos = this.playerCollider.start.clone();
        const pRadius = this.playerCollider.radius;
        const pCenter = new THREE.Vector3();
        this.playerCollider.getCenter(pCenter);

        for (const mesh of colliders) {
            // Skip collision if this is a wall with an active portal we are walking into
            if (mesh.userData.isWall && !this.portalSystem.shouldCollide(mesh, pCenter)) {
                continue;
            }

            // OBB Collision (Sphere vs Oriented Box)
            // Transform sphere center to local space of the mesh
            const inverseMatrix = mesh.matrixWorld.clone().invert();
            const localPos = pPos.clone().applyMatrix4(inverseMatrix);
            
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            const aabb = mesh.geometry.boundingBox;
            
            const closestLocal = new THREE.Vector3();
            aabb.clampPoint(localPos, closestLocal);
            
            const localDelta = localPos.clone().sub(closestLocal);
            const distSq = localDelta.lengthSq();
            
            if (distSq < pRadius * pRadius) {
                let dist = Math.sqrt(distSq);
                let localNormal = new THREE.Vector3();
                let overlap = 0;
                
                if (dist < 0.0001) {
                    // Inside center logic
                    const dx = Math.min(Math.abs(localPos.x - aabb.min.x), Math.abs(aabb.max.x - localPos.x));
                    const dy = Math.min(Math.abs(localPos.y - aabb.min.y), Math.abs(aabb.max.y - localPos.y));
                    const dz = Math.min(Math.abs(localPos.z - aabb.min.z), Math.abs(aabb.max.z - localPos.z));
                    
                    const minAxis = Math.min(dx, dy, dz);
                    
                    if (minAxis === dx) localNormal.set(localPos.x > (aabb.min.x + aabb.max.x)/2 ? 1 : -1, 0, 0);
                    else if (minAxis === dy) localNormal.set(0, localPos.y > (aabb.min.y + aabb.max.y)/2 ? 1 : -1, 0);
                    else localNormal.set(0, 0, localPos.z > (aabb.min.z + aabb.max.z)/2 ? 1 : -1);
                    
                    overlap = minAxis + pRadius;
                } else {
                    localNormal.copy(localDelta).normalize();
                    overlap = pRadius - dist;
                }
                
                // Transform normal to world space
                const worldNormal = localNormal.clone().transformDirection(mesh.matrixWorld).normalize();
                
                // Resolve
                const correction = worldNormal.clone().multiplyScalar(overlap);
                this.playerCollider.translate(correction);
                pPos.add(correction); 
                
                // Velocity response
                if (worldNormal.y > 0.5) {
                    this.playerOnFloor = true;
                    this.playerVelocity.y = Math.max(0, this.playerVelocity.y);
                } else if (worldNormal.y < -0.5) {
                    this.playerVelocity.y = Math.min(0, this.playerVelocity.y);
                }
                
                const vDotN = this.playerVelocity.dot(worldNormal);
                this.playerVelocity.sub(worldNormal.multiplyScalar(vDotN));
            }
        }
        
        // Floor reset if falling infinitely
        const center = new THREE.Vector3();
        this.playerCollider.getCenter(center);
        if (center.y < -20) {
            this.playerCollider.start.set(0, 0.35, 0);
            this.playerCollider.end.set(0, 1.35, 0);
            this.playerVelocity.set(0, 0, 0);
        }
    }

    updateCamera() {
        const camPos = new THREE.Vector3();
        this.playerCollider.getCenter(camPos);
        camPos.y += 0.5; // Eye height
        this.camera.position.copy(camPos);
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
}