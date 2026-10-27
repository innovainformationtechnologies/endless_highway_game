let three, camera, renderer;
let scene = [];
let player;
let laneX = [-2, 0, 2];
let currentLane = 1;
let activeObstacles = [];
let score = 0;
let scrapes = 0;
let gameOver = false;
let paused = true;
let debug = true;
let tokens = Number(localStorage.getItem("tokens")) ?? 25
let run_distance = 0;
let trafficDensity = 10;

// Speeds
let baseSpeed = 1.0;
let speed = baseSpeed;

// Combo system
let combo = 0;
let lastNearMissTime = 0;
const comboTimeout = 10.0; // seconds without near-miss resets combo
const proximityBoxSize = { x: 5, y: 1.5, z: 7 }; // lane width, height, forward/back
const scrapeBoxSize = { x: 3, y: 1.5, z: 3 }; // scrape box size
let scrapeBoxOffsetZ = 10; // scrape box offset

class Car {
    constructor(name="Car"+Math.random()%9999+1111, update = () => {}, options = { color: 0xaaaaaa, weight: 40, power:55, durability:15, size:50, friction:0.5}) {
        this.options = options;
        this.state = Object.create(options);
        this.updateFunc = update;
        
        this.mesh = new THREE.Mesh(
        
        new THREE.BoxGeometry((options.size*.01)*2, options.size*.01, (options.size*.01)*4),
        new THREE.MeshStandardMaterial({ color: this.state.color })
        );

        this.mesh.position.y = 0.25;
        
    }

    update(delta){
        this.updateFunc(this, delta);
    }

    reset(){
        this.state.durability = this.options.durability;
    }

    setPosition(x, z) {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    }

    setMomentumX(x) {
        this.state.momentumX = x;
    }

    move(delta, speed) {
        let new_pos = speed * delta
        // console.log(this.name + " moving " + new_pos);
        this.mesh.position.z += new_pos;
    }

    getBoundingBox() {
    return new THREE.Box3().setFromObject(this.mesh);
    }
}

function checkRearCollision(carA, carB) {
    return carA.getBoundingBox().intersectsBox(carB.getBoundingBox());
}

function getProximityBox() {
    const box = new THREE.Box3();
    box.setFromCenterAndSize(
    player.mesh.position,
    new THREE.Vector3((player.state.size*.01)*proximityBoxSize.x, ((player.state.size*.01))*proximityBoxSize.y, ((player.state.size*.01))*proximityBoxSize.z)
    );
    return box;
}

function getScrapeBox() {
    const box = new THREE.Box3();
    let center = player.mesh.position.clone();
    center.add(new THREE.Vector3(0, 0, scrapeBoxOffsetZ));
    let size = new THREE.Vector3((player.state.size*.01)*scrapeBoxSize.x, ((player.state.size*.01))*scrapeBoxSize.y, ((player.state.size*.01))*scrapeBoxSize.z);
    box.setFromCenterAndSize(center, size)
    // console.log(box);
    return box;
}

function checkNearMiss(proxBox, car) {
    return proxBox.intersectsBox(car.getBoundingBox());
}

function checkScrape(scrapeBox, car) {
    return scrapeBox.intersectsBox(car.getBoundingBox());
}

function calculateNearMiss(player, car, time) {
    const distance = car.mesh.position.z - player.mesh.position.z;
    const maxDistance = proximityBoxSize.z / 2;
    let points = Math.max(1, Math.floor((1 - Math.abs(distance) / maxDistance) * 5)); 
    points *= (1 + combo * 0.5); // combo multiplier
    console.log(points + " points for " + distance + " distance");
    return points;
}

function updateNPCCar(car) {
    // scene.add(car.mesh);
}
function updatePlayerCar(car, delta) {
    if (!car.state.momentumX)
        car.state.momentumX = 0;
    // console.log(car.options)
    if (car.state.durability < 0){
        car.mesh.material.color.set(0xff0000);
    }
    else if (car.state.durability < 15){
        car.mesh.material.color.set(0xffaa00);
        car.state.durability += delta * 1.5;
    }
    else {
        car.mesh.material.color.set(car.options.color);
    }
    // Smooth lane movement
    const targetX = laneX[currentLane];
    let laneDelta = targetX - player.mesh.position.x;
    
    let accel = laneDelta * (player.state.power/player.state.weight) - (player.state.friction*player.state.weight) * player.state.momentumX ;
    player.state.momentumX += accel * delta;
    
    player.mesh.position.x += player.state.momentumX;
}

function spawnCar(car, lane, z) {
    console.log("spawning car");
    car.setPosition(lane, z);
    three.add(car.mesh);
    scene.push(car);
}

function setupScene() {
    three = new THREE.Scene();
    three.background = new THREE.Color(0x0a0a44); // deep summer-night blue

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Ground
    const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2000),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -950;
    three.add(ground);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    three.add(light);
    three.add(new THREE.AmbientLight(0x404040));

    // Player
    player = new Car("Player", updatePlayerCar, { color: 0xaaaaaa, weight: 75, power:1000, durability:15, size:50, friction:0.375});
    spawnCar(player, 1, 0);

    // Touch buttons
    document.getElementById('leftBtn').addEventListener('touchstart', () => moveLeft(), { passive: false });
    document.getElementById('rightBtn').addEventListener('touchstart', () => moveRight(), { passive: false });
    document.getElementById('exit').addEventListener('touchstart', () => showMenu(), { passive: false });
    
    // sliders
    document.getElementById('power').addEventListener('input', e => player.state.power = Number(e.target.value));
    document.getElementById('weight').addEventListener('input', e => player.state.weight = Number(e.target.value));
    document.getElementById('friction').addEventListener('input', e => player.state.friction = Number(e.target.value));
    document.getElementById('scrape_box_offset').addEventListener('input', e => scrapeBoxOffsetZ = Number(e.target.value));
    document.getElementById('traffic_density').addEventListener('input', e => trafficDensity = Number(e.target.value));
    document.getElementById('power').value = player.state.power;
    document.getElementById('weight').value = player.state.weight;
    document.getElementById('friction').value = player.state.friction;
    document.getElementById('scrape_box_offset').value = scrapeBoxOffsetZ;
    document.getElementById('traffic_density').value = trafficDensity;

    // Keyboard
    window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft();
    if (e.key === 'ArrowRight' || e.key === 'd') moveRight();
    if (e.key === 'p') togglePause();
    if (e.key === 'q') showMenu();
    });

    window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
}

function moveLeft() { previousLane = currentLane; currentLane = Math.max(0, currentLane - 1); }
function moveRight() { previousLane = currentLane; currentLane = Math.min(laneX.length - 1, currentLane + 1); }

let lastSpawnDist = 0;
function spawnObstacle() {
    if (run_distance - lastSpawnDist < trafficDensity) return
    let name = "NPC"+Math.random()%9999+1111;
    const car = new Car(name, updateNPCCar, { color: 0xffffff, weight: 40, power:55, durability:15, size:50, friction:0.5});
    const lane = laneX[Math.floor(Math.random() * laneX.length)];
    spawnCar(car, lane, camera.position.z - 175);
    activeObstacles.push(car);
    lastSpawnDist = run_distance;
}

function adjustDifficulty(){
    trafficDensity = Math.random() * 20 + 5;
    console.log("traffic density: " + trafficDensity);
    setTimeout(() => {
        adjustDifficulty();
    }, 1000);
}

function stepPhysics(delta) {
    // Random spawn: 2% chance per frame
    if (Math.random() < 0.02) {
        spawnObstacle();
    }

    const proxBox = getProximityBox();
    const scrapeBox = getScrapeBox();
    
    const accel = (player.state.power/player.state.weight)-(player.state.friction*(speed**2)) ;
    speed += accel*delta;

    for (let i = activeObstacles.length - 1; i >= 0; i--) {
        const car = activeObstacles[i];
        car.move(delta, speed);
        checkCollisions(proxBox, scrapeBox, car);
        if (car.mesh.position.z > camera.position.z + 50) {
            console.log("you passed a car");
            three.remove(car.mesh);
            activeObstacles.splice(i, 1);
        }
    }
    
    run_distance += speed * delta;
}

function checkCollisions(proxBox, scrapeBox, car){
    const currentTime = performance.now() / 1000;

    // Reset combo if timeout exceeded
    if (combo > 0 && currentTime - lastNearMissTime > comboTimeout) {
    combo = 0;
    }
    if (checkNearMiss(proxBox, car)) {
        let points = calculateNearMiss(player, car, currentTime);
        combo++;
        if (checkScrape(scrapeBox, car)) {
            player.state.durability -= 15;
            if (localStorage.getItem('high_combo') < combo || localStorage.getItem('high_combo') == null){
                localStorage.setItem('combo', combo);
            }
            combo = 0;
            scrapes++;
            console.log("you scraped " + scrapes + " times");
            speed = baseSpeed;
            // bump player away from obstacle
            let direction = Math.sign(car.mesh.position.x - player.mesh.position.x);
            let lane = currentLane + direction;
            if (lane < 0) lane = laneX.length - 1;
            if (lane > laneX.length - 1) lane = 0;
            currentLane = lane;
            player.setMomentumX(0);
            player.setPosition(laneX[lane], player.mesh.position.z);
            score += points * speed;
            return
        } else if (checkRearCollision(player, car)) {
            console.log("you crashed");
            player.state.durability -= 30;
            points = 0;
            speed = 0
            if (localStorage.getItem('high_combo') < combo || localStorage.getItem('high_combo') == null){
                localStorage.setItem('combo', combo);
            }
            combo = 0;
            return
        } else{
            console.log("you're swimming");
            score += points * speed * combo;
        }
    }
    
}

function updateScene(delta){
    scene.forEach(obj => {
        if (obj.update) obj.update(delta);
    });
    if (player.state.durability < 0){
        gameOver = true;
        paused = true;
        resetGame();
        return;
    }
}

function updateUI(delta){
    if (paused){
        document.querySelector('#high_score').innerText = "High Score: " + Math.floor(localStorage.getItem("high_score")) + " High Combo: " + localStorage.getItem("high_combo") + " Max Distance: " + Math.floor(localStorage.getItem("high_run_distance")) + " Tokens: " + tokens;
        
    }
    if (paused == false)
        document.querySelector('#score').innerText = "Score: " + Math.floor(score) + " Combo: " + combo + " Speed: " + Math.floor(speed) + " Distance: " + Math.floor(run_distance) + " Tokens: " + tokens;
    document.getElementById('power_label').innerText = "Power: " + player.state.power;
    document.getElementById('weight_label').innerText = "Weight: " + player.state.weight;
    document.getElementById('friction_label').innerText = "Friction: " + player.state.friction;
    document.getElementById('scrape_box_offset_label').innerText = "Scrape Box Offset: " + scrapeBoxOffsetZ;
    document.getElementById('traffic_density_label').innerText = "Traffic Density: " + trafficDensity;
}

function pause(){
    paused = true;
}
function unpause(){
    paused = false;
}
function togglePause(){
    paused = !paused;
}

function resetGame() {
    if (tokens <= 0) showMenu();
    scene = [];
    if (gameOver){
        if (localStorage.getItem('high_score') < score || localStorage.getItem('high_score') == null){
            localStorage.setItem('high_score', score);
        }
        score = 0;
        if (localStorage.getItem('high_combo') < combo || localStorage.getItem('high_combo') == null){
            localStorage.setItem('high_combo', combo);
        }
        combo = 0;
        if (localStorage.getItem('max_scrapes') < scrapes || localStorage.getItem('high_scrapes') == null){
            localStorage.setItem('scapes', scrapes);
        }
        scrapes = 0;
        if (localStorage.getItem('high_run_distance') < run_distance || localStorage.getItem('high_run_distance') == null){
            localStorage.setItem('run_distance', run_distance);
        }
        run_distance = 0;
        lastSpawnDist = 0;
    };
    gameOver = false;
    player.reset();
    spawnCar(player, laneX[2], 0);
    setTimeout(() => {
        paused = false;
        tokens -= 1
        localStorage.setItem("tokens", tokens);
        activeObstacles.forEach(car => three.remove(car.mesh));
        activeObstacles = [];
        currentLane = 1;
        speed = baseSpeed;
    }, 1000);
}

let lastTime = 0.016;
function animate(time) {
    requestAnimationFrame(animate);
    
    if (tokens < 0) showMenu(); // check game over at start
    
    
    if (lastTime == 0) lastTime = time;
    const delta = (time - lastTime)*.001; 
    // console.log(delta);
        
    if (!paused){
        stepPhysics(delta);
        updateScene(delta);
    }
    updateUI(delta);
    if (debug){
        // draw proximity box
        // 1. Call the function to get your Box3 instance
        const proxBox3 = getProximityBox();

        // 2. Extract the physical size and center point from it
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();

        proxBox3.getSize(size);
        proxBox3.getCenter(center);

        // 3. Create the geometry matching those exact dimensions
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);

        // 4. Create your material (using a transparent wireframe look is common for proximity zones)
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            wireframe: true 
        });

        // 5. Build the mesh and position it at the center of the Box3
        const proximityVisualMesh = new THREE.Mesh(geometry, material);
        proximityVisualMesh.position.copy(center);

        // 6. Add it to your rendering scene loop
        three.add(proximityVisualMesh);

 
        // draw scrape box
        const scrapeBox = getScrapeBox();
        // 2. Extract the physical size and center point from it
        const scrapeSize = new THREE.Vector3();
        const scrapeCenter = new THREE.Vector3();

        scrapeBox.getSize(scrapeSize);
        scrapeBox.getCenter(scrapeCenter);

        // 3. Create the geometry matching those exact dimensions
        const scrapeGeometry = new THREE.BoxGeometry(scrapeSize.x, scrapeSize.y, scrapeSize.z);

        // 4. Create your material (using a transparent wireframe look is common for proximity zones)
        const scrapeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, 
            wireframe: true 
        });

        // 5. Build the mesh and position it at the center of the Box3
        const scrapeVisualMesh = new THREE.Mesh(scrapeGeometry, scrapeMaterial);
        scrapeVisualMesh.position.copy(center);

        // 6. Add it to your rendering scene loop
        three.add(scrapeVisualMesh);
        renderer.render(three, camera);
        // Remove debug visuals
        three.remove(proximityVisualMesh);
        three.remove(scrapeVisualMesh);
    } else {
        renderer.render(three, camera);
    }
    lastTime = time;
}

function startGame(){
    if (tokens <= 0){
        tokens=0;
        let more_tokens = confirm("You have no tokens to play with. Watch an ad for more!", "Watch an ad for more!");
        if (more_tokens){
            tokens += 10
            alert("adding 10 tokens. you now have " + tokens);
            localStorage.setItem("tokens", tokens);
        }
        return;
    }
    console.log("starting game");
    document.getElementById('main_menu').classList.remove('visible');
    document.getElementById('in_game').classList.add('visible');
    resetGame()
}

function showMenu(){
    currentLane = 2;
    document.getElementById('in_game').classList.remove('visible');
    document.getElementById('main_menu').classList.add('visible');
    paused = true;
    gameOver = false;
}

window.onload=()=>{
    document.getElementById('start_game').addEventListener('click', startGame);
    setupScene();
    animate();
    showMenu();
}