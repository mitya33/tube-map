/* ---
| PREP
--- */

const defaults = {
	showGrid: 1,
	snapToGrid: 0,
	jointsMode: 1,
	gridSquareSize: 60,
	grid: [13, 7],
	dragMode: 1
};
const ns = 'http://www.w3.org/2000/svg';
const cssClasses = {
	appId: 'tube-map',
	route: 'route-',
	showingHighlightedRoute: 'showing-highlighted-route',
	onHighlightedRoute: 'is-on-highlighted-route',
	dragMode: 'drag-mode-',
	jointsMode: 'joints-mode-'
};
const urlify = str => str.toLowerCase().replace(/\W/g, '-').replace(/-{2,}/g, '-');
const validEvts = {
	block: ['click', 'hover', 'drag', 'dragEnd']
};
validEvts.joint = validEvts.block;

/* ---
| CLASS
--- */

export class TubeMap {

	#el;
	#canvases
	#opts;
	#blocks;
	#connectors;
	#joints;
	#dragging;
	#offset;
	#highlightedRoute;
	#events;

	/* ---
	| SETUP - args:
	|	$el (str)	- a selector string targeting a container element
	|	$opts (obj)	- an object of params - gets merged into $defaults
	--- */

	constructor(el, opts = {}) {
		this.#el = document.querySelector(el);
		this.#opts = Object.assign(defaults, opts);
		this.#blocks = [];
		this.#connectors = [];
		this.#joints = [];
		this.#dragging = null;
		this.#offset = null;
		this.#events = {block: [], joint: []};
		this.#buildCanvas();
		this.#opts.dragMode && this.#dragDrop();
		this.listenEvents();
	}

	/* ---
	| BUILD CANVAS
	--- */

	#buildCanvas() {

		//prep container
		this.#el.innerHTML = '';
		this.#el.className = '';
		this.#el.classList.add(
			cssClasses.appId,
			cssClasses.jointsMode+this.#opts.jointsMode,
			cssClasses.dragMode+this.#opts.dragMode
		);

		//add elements
		this.#el.innerHTML = `
			<svg class='blocks'></svg>
			<svg class='connectors'></svg>
			<svg class='grid'></svg>
		`;
		this.#canvases = {
			grid: this.#el.querySelector('.grid'),
			blocks: this.#el.querySelector('.blocks'),
			connectors: this.#el.querySelector('.connectors')
		};

		//draw grid
		this.#el.style.width = ((this.#opts.grid[0]+1) * this.#opts.gridSquareSize)+'px';
		this.#el.style.height = ((this.#opts.grid[1]+1) * this.#opts.gridSquareSize)+'px';
		this.#opts.showGrid && ['x', 'y'].forEach(axis => {
			let i = this.#opts.gridSquareSize / 2;
			while(i < (this.#opts.grid[axis == 'x' ? 0 : 1]+1) * this.#opts.gridSquareSize) {
				let line = document.createElementNS(ns, 'line');
				line.setAttribute('x1', axis == 'x' ? i : 0);
				line.setAttribute('x2', axis == 'x' ? i : (this.#opts.grid[0]+1) * this.#opts.gridSquareSize);
				line.setAttribute('y1', axis == 'x' ? 0 : i);
				line.setAttribute('y2', axis == 'x' ? (this.#opts.grid[1]+1) * this.#opts.gridSquareSize : i);
				this.#canvases.grid.appendChild(line);
				i += this.#opts.gridSquareSize;
			}
		});
	}

	/* ---
	| DRAG & DROP - drag and drop blocks and joints
	--- */

	#dragDrop() {
		this.#canvases.blocks.addEventListener('mousedown', evt => {
			if (!evt.target.matches('circle')) return;
			this.#dragging = evt.target;
			this.#dragging.classList.add('dragging');
			this.#offset = {
				x: evt.pageX - this.#el.offsetLeft - this.#dragging.getAttribute('cx'),
				y: evt.pageY - this.#el.offsetTop - this.#dragging.getAttribute('cy')
			};
		});
		this.#canvases.blocks.addEventListener('mousemove', evt => {
			if (!this.#dragging) return;
			const coords = {
				x: evt.pageX - this.#el.offsetLeft - this.#offset.x,
				y: evt.pageY - this.#el.offsetTop - this.#offset.y
			};
			this.#opts.snapToGrid && ['x', 'y'].forEach(which =>
				coords[which] = (Math.round(coords[which] / this.#opts.gridSquareSize) * this.#opts.gridSquareSize)
			);
			['x', 'y'].forEach(which => this.#dragging.setAttribute('c'+which, this.#dragging.obj[which] = coords[which]));
			this.#joinUp(this.#dragging.matches('.block') ? 'dragBlock' : 'dragJoint', this.#dragging);
			this.highlightRoute(this.#highlightedRoute);
		});
		document.body.addEventListener('mouseup', evt => {
			this.#dragging.classList.remove('dragging');
			this.#dragging = null;
		});
	}

	/* ---
	| SET RELATIONSHIPS - between a block and other blocks. Args:
	|	$blockId (int)	- obv.
	|	$rels (arr) 	- array of block IDs to relate $block to
	--- */

	setRels(blockId, rels = []) {
		const block = this.#blocks.find(block => block.id == blockId.toString());
		if (!block) return console.error(`No such block, "${blockId}"`);
		if (rels.find(to => to == blockId))
			return console.error('Cannot link to self');
		if (rels.find(to => !this.#blocks.find(block => block.id == to)))
			return console.error(`One more target blocks don't exist`);
		block.joinTo = rels || [];
		this.#joinUp('addRel');
	}

	/* ---
	| JOIN UP - draw connectors and joints between blocks as per relationships. Args:
	|	$trigger (str) 	- what triggered the re-draw - 'addRel', 'dragBlock' or 'dragJoint'
	--- */

	#joinUp(trigger) {

		//clear current - grab existing joint positions first so existing joints can stay unmoved
		const prevJoints = this.#joints.filter(obj => obj);
		const prevConnectors = this.#connectors.filter(obj => obj);
		this.#connectors.forEach(obj => obj.el.remove());
		this.#connectors = [];
		if (trigger == 'addRel') {
			this.#joints.forEach(obj => obj.el.remove());
			this.#joints = [];
		}

		//joints - redrawn only if relationships changed, and those already extant stay unmoved...
		this.#opts.jointsMode && trigger == 'addRel' && this.#blocks.forEach((block, i) =>
			block.joinTo.forEach(targetBlockId => {
				const targetBlock = this.#canvases.blocks.querySelector('#'+targetBlockId);
				const joint =
					prevJoints.find(obj => obj.between.includes(targetBlockId) && obj.between.includes(block.id)) ||
					{id: this.#joints.length, between: [block.id, targetBlockId]};
				joint.el = document.createElementNS(ns, 'circle');
				joint.el.classList.add('joint');
				joint.route && joint.el.classList.add(cssClasses.route+urlify(joint.route));
				joint.onHighlightedRoute && joint.el.classList.add(cssClasses.onHighlightedRoute);
				joint.el.obj = joint;
				['x', 'y'].forEach(which => joint[which] = !joint[which] ?
					Math.min(block[which], targetBlock.obj[which]) + (Math.abs(block[which] - targetBlock.obj[which]) / 2) :
					joint[which]
				);
				this.#opts.snapToGrid && ['x', 'y'].forEach(which =>
					joint[which] = (Math.round(joint[which] / this.#opts.gridSquareSize) * this.#opts.gridSquareSize)
				);
				['x', 'y'].forEach(which => joint.el.setAttribute('c'+which, joint[which]));
				this.#canvases.blocks.appendChild(joint.el);
				this.#joints.push(joint);
			})
		);

		//connectors - joints enabled: connect blocks to intermediary joint
		this.#opts.jointsMode && this.#joints.forEach(joint => 
			joint.between.forEach(blockId => {
				const block = this.#canvases.blocks.querySelector('#'+blockId);
				shared.call(this, block, joint, block.obj, joint);
			})
		);

		//connectors - joints disabled: connect directly between blocks)
		!this.#opts.jointsMode && this.#blocks.forEach(block =>
			block.joinTo.forEach(targetBlockId => {
				const targetBlock = this.#canvases.blocks.querySelector('#'+targetBlockId);
				shared.call(this, block, targetBlock, block, targetBlock.obj);
			})
		);

		//connectors - shared logic by both above routes i.e. using and not using joints)
		function shared(block, jointOrTargetBlock, x1y1, x2y2) {
			const line = document.createElementNS(ns, 'line');
			const connector =
				prevConnectors.find(obj => obj.from == block.id && obj.to == jointOrTargetBlock.id) ||
				{from: block.id, to: jointOrTargetBlock.id};
			connector.el = line;
			connector.route && line.classList.add(cssClasses.route+urlify(connector.route));
			connector.onHighlightedRoute && line.classList.add(cssClasses.onHighlightedRoute);
			this.#canvases.connectors.appendChild(line);
			this.#connectors.push(connector);
			line.setAttribute('x1', x1y1.x);
			line.setAttribute('x2', x2y2.x);
			line.setAttribute('y1', x1y1.y);
			line.setAttribute('y2', x2y2.y);
		}

	}

	/* ---
	| EVENTS - listen for events and fire bound callbacks
	--- */

	listenEvents() {
		this.#el.addEventListener('click', evt => {
			if (!evt.target.matches('.block, .joint')) return;
			['block', 'joint'].filter(scope => evt.target.matches('.'+scope)).forEach(scope =>
				this.#events[scope].forEach(obj => obj.evt == 'click' && obj.cb(evt, evt.target.obj))
			);
		});
	}

	/* ---
	| API: ADD BLOCK - add a block to the grid. Args:
	|	$id (str; optnl)		- an ID for this block (defaults to "block-0", "block-1" etc.)
	|	$params (obj; optnl)	- including:
	|		$coords (obj)		- object of $x/$y grid point (if using grid) or coords, otherwise defaults to square 1/1
	|		$data (obj)			- object of meta data to store on the block
	|		$color (str) 		- colour string ("green", "#f90", "rgba(255, 0, 0, .5)" etc.) for this block
	|		$class (str)		- CSS class(es) to add to the block
	--- */

	addBlock(id, params = {}) {
		if (!id) id = 'block-'+(Object.keys(this.#blocks).length+1);
		if (this.#blocks[id]) return console.error(`Block already exists with ID "${id}"`);
		if ((params.x && (params.x < 1 || params.x > this.#opts.grid[0])) || (params.y && (params.y < 1 || params.y > this.#opts.grid[1])))
			return console.error('Invalid coordinates');
		const startCoords = {x: (params.x || 1) * this.#opts.gridSquareSize, y: (params.y || 1) * this.#opts.gridSquareSize};
		const block = {
			el: document.createElementNS(ns, 'circle'),
			id,
			x: startCoords.x,
			y: startCoords.y,
			joinTo: [],
			routes: [],
			data: params.data || {},
		};
		block.el.obj = block;
		this.#opts.onClickBlock && block.el.addEventListener('click', evt => this.#opts.onClickBlock(evt, block));
		block.el.classList.add(...['block', !params.class ? [] : params.class.split(' ')].flat());
		if (params.color) block.el.style.fill = params.color;
        block.el.setAttribute('cx', block.x);
        block.el.setAttribute('cy', block.y);
		block.el.setAttribute('id', id);
		this.#canvases.blocks.appendChild(block.el);
		this.#blocks.push(block);
	}

	/* ---
	| API: REMOVE BLOCK - remove a block from the grid. Args:
	|	$id (str)	- the block ID
	--- */

	removeBlock(id) {
		const index = this.#blocks.findIndex(block => block.id == id);
		if (!index) return console.error(`No such block, "${id}"`);
		this.#blocks[index].el.remove();
		this.#blocks.splice(index, 1);
		this.#joints.forEach((obj, i) => {
			if (obj.between.includes(id)) {
				obj.el.remove();
				this.#joints.splice(i, 1);
			}
		});
		this.#joinUp();
	}

	/* ---
	| API: ADD ROUTE - define a route via several waypoints (blocks). Args:
	|	$name (str)		- the route name
	|	$steps (arr) 	- array of block IDs along the route
	--- */

	addRoute(name, steps = []) {
		if (!name) return console.error('Route name must be passed');
		if (!steps || !steps.length) return;
		if (steps.find(blockId => !this.#blocks.find(block => block.id == blockId)))
			return console.error('Steps array references one or more invalid block IDs');
		const nameSafe = urlify(name);
		let routeBlocks = this.#blocks.filter(block => steps.includes(block.id));
		routeBlocks.forEach(block => {
			block.routes.push(name);
			block.el.classList.add(cssClasses.route+nameSafe);
		});
		routeBlocks = routeBlocks.map(block => block.id);
		let routeJoints = this.#joints.filter(obj => steps.includes(obj.between[0]) && steps.includes(obj.between[1]));
		routeJoints.forEach(obj => {
			obj.route = name;
			obj.el.classList.add(cssClasses.route+nameSafe);
		});
		routeJoints = routeJoints.map(joint => joint.id);
		this.#connectors.filter(obj => {
			return (
				(this.#opts.jointsMode && (routeJoints.includes(obj.from) || routeJoints.includes(obj.to))) ||
				(!this.#opts.jointsMode && routeBlocks.includes(obj.from) && routeBlocks.includes(obj.to))
			);
		}).forEach(obj => {
			obj.route = name;
			obj.el.classList.add(cssClasses.route+nameSafe);
		});
	}

	/* ---
	| API: HIGHLIGHT ROUTE - highlight a route that was previously defined via addRoute(). Unhighlight by passing no args. Args:
	|	$route (str) 	- the name of the route to highlight
	--- */

	highlightRoute(route) {
		this.#el.classList.remove(cssClasses.showingHighlightedRoute);
		[...this.#blocks, ...this.#connectors, ...this.#joints].forEach(obj => {
			obj.onHighlightedRoute = false;
			obj.el.classList.remove(cssClasses.onHighlightedRoute);
		});
		if (!route) return;
		[
			...this.#blocks.filter(obj => obj.routes.includes(route)),
			[...this.#joints, ...this.#connectors].filter(obj => obj.route == route),
		].flat().forEach(obj => {
			obj.el.classList.add(cssClasses.onHighlightedRoute);
			obj.onHighlightedRoute = true;
		});
		this.#highlightedRoute = name;
		this.#el.classList.add(cssClasses.showingHighlightedRoute);
	}

	/* ---
	| API: ON... - register an event of some kind. Args:
	|	$evt (str)	- 'click', 'hover', 'dragEnd'
	|	$scope (str)	- 'block' or 'joint'
	|	$cb (func)		- the callback
	--- */

	on(evt, scope, cb) {
		if (!validEvts[scope] || !validEvts[scope].includes(evt))
			return console.error(`Invalid event and/or scope, ${evt+':'+scope}`);
		this.#events[scope] = this.#events[scope] || [];
		this.#events[scope].push({evt, cb});
	}

	/* ---
	| API: GET BLOCK - get a block by its ID. Args:
	|	$id (str) 	- obv.
	--- */

	getBlock(id) {
		const block = this.#blocks.find(block => block.id == id);
		if (!block) return console.error(`No such block, "${id}"`);
		return block;
	}

	/* ---
	| API: EXPORT - export all data, for future reimport
	--- */

	export() {
		const ret = {};
		return {
			blocks: this.#blocks.map(obj => { delete obj.el; return obj; }),
			joints: this.#joints.map(obj => { delete obj.el; return obj; }),
			connectors: this.#connectors.map(obj => { delete obj.el; return obj; }),
		};
	}

}