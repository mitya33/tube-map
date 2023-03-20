//prep
const defaults = {
	showGrid: 1,
	snapToGrid: 0,
	jointsMode: 1,
	gridSquareSize: 60,
	grid: [13, 7],
	dragMode: 1
};
const ns = 'http://www.w3.org/2000/svg';
const urlify = str => str.toLowerCase().replace(/\W/g, '-').replace(/-{2,}/g, '-');

//class
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
	#routes;
	#dragHappened;

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
		this.#dragging = this.#offset = this.#dragHappened = null;
		this.#events = [];
		this.#routes = {};
		this.#buildCanvas();
		this.#opts.dragMode && this.#dragDrop();
	}

	/* ---
	| BUILD CANVAS
	--- */

	#buildCanvas() {

		//prep container
		this.#el.innerHTML = '';
		this.#el.className = '';
		this.#el.classList.add(
			'tube-map',
			'joints-mode-'+this.#opts.jointsMode,
			'drag-mode-'+this.#opts.dragMode
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
			evt.target.classList.add('dragging');
			this.#offset = {
				x: evt.pageX - this.#el.offsetLeft - this.#dragging.getAttribute('cx'),
				y: evt.pageY - this.#el.offsetTop - this.#dragging.getAttribute('cy')
			};
		});
		this.#canvases.blocks.addEventListener('mousemove', evt => {
			if (!this.#dragging) return;
			this.#dragHappened = 1;
			this.#events.forEach(obj => obj.evt == 'drag' && obj.cb(evt, this.#dragging));
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
			if (!this.#dragging) return;
			this.#dragging.classList.remove('dragging');
			this.#events.forEach(obj => obj.evt == 'drop' && obj.cb(evt, this.#dragging));
			this.#dragging = null;
			setTimeout(() => this.#dragHappened = null, 1);
		});
	}

	/* ---
	| JOIN UP - draw connectors and joints between blocks as per relationships. Args:
	|	$trigger (str) 	- what triggered the re-draw - 'connect', 'dragBlock' or 'dragJoint'
	--- */

	#joinUp(trigger) {

		//clear current - grab existing joint positions first so existing joints can stay unmoved
		const prevJoints = this.#joints.filter(obj => obj);
		const prevConnectors = this.#connectors.filter(obj => obj);
		this.#connectors.forEach(obj => obj.el.remove());
		this.#connectors = [];
		if (trigger == 'connect') {
			this.#joints.forEach(obj => obj.el.remove());
			this.#joints = [];
		}

		//joints - redrawn only if relationships changed, and those already extant stay unmoved...
		this.#opts.jointsMode && trigger == 'connect' && this.#blocks.forEach((block, i) => {
			const targetBlockIds = [...new Set(Object.values(block.joinTo).flat().filter(rel => rel.to).map(rel => rel.to))];
			targetBlockIds.forEach(targetBlockId => {
				const targetBlock = this.#canvases.blocks.querySelector('#'+targetBlockId);
				const routes = new Set([...Object.keys(block.joinTo), ...Object.keys(targetBlock.obj.joinTo)].filter(route =>
					block.joinTo[route] && targetBlock.obj.joinTo[route]
				));
				//console.log(block.id, targetBlockId, block.joinTo, 'vs', targetBlock.obj.joinTo, '=', routes);
				const preev = prevJoints.find(obj => obj.between.includes(targetBlockId) && obj.between.includes(block.id));
				const joint =
					preev ||
					{id: this.#joints.length, between: [block.id, targetBlockId], routes};
				joint.el = document.createElementNS(ns, 'circle');
				joint.el.classList.add('joint', ...[...joint.routes].map(route => 'route-'+urlify(route)));
				joint.onHighlightedRoute && joint.el.classList.add('is-on-highlighted-route');
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
		});

		//connectors - joints enabled: connect blocks to intermediary joint
		this.#opts.jointsMode && this.#joints.forEach(joint =>
			joint.routes.forEach(route => 
				joint.between.forEach(blockId => {
					const block = this.#canvases.blocks.querySelector('#'+blockId);
					shared.call(this, block, joint, block.obj, joint, route);
				})
			)
		);

		//connectors - joints disabled: connect directly between blocks)
		!this.#opts.jointsMode && this.#blocks.forEach(block =>
			Object.keys(block.joinTo).forEach(route => {
				block.joinTo[route].forEach(targetBlockId => {
					const targetBlock = this.#canvases.blocks.querySelector('#'+targetBlockId);
					shared.call(this, block, targetBlock, block, targetBlock.obj, route);
				})
			})
		);

		//connectors - shared logic by both above routes i.e. using and not using joints)
		function shared(block, jointOrTargetBlock, x1y1, x2y2, route) {
			const line = document.createElementNS(ns, 'line');
			const connector =
				prevConnectors.find(obj => obj.from == block.id && obj.to == jointOrTargetBlock.id) ||
				{from: block.id, to: jointOrTargetBlock.id, route};
			connector.el = line;
			line.classList.add('route-'+urlify(connector.route));
			connector.onHighlightedRoute && line.classList.add('is-on-highlighted-route');
			this.#canvases.connectors.appendChild(line);
			this.#connectors.push(connector);
			line.setAttribute('x1', x1y1.x);
			line.setAttribute('x2', x2y2.x);
			line.setAttribute('y1', x1y1.y);
			line.setAttribute('y2', x2y2.y);
		}

	}

	//API methods...

	/* ---
	| ADD BLOCK - add a block to the grid. Args:
	|	$id (str; optnl)		- an ID for this block (defaults to "block-0", "block-1" etc.)
	|	$params (obj; optnl)	- including:
	|		$coords (obj)		- object of $x/$y grid point (if using grid) or coords, otherwise defaults to square 1/1
	|		$data (obj)			- object of meta data to store on the block
	|		$class (str)		- CSS class(es) to add to the block
	--- */

	addBlock(id, params = {}) {
		if (!id) id = 'block-'+(Object.keys(this.#blocks).length+1);
		if (this.#blocks[id]) return console.error(`Block already exists with ID "${id}"`);
		if (
			(params.x && (params.x < 1 || params.x > this.#opts.grid[0])) ||
			(params.y && (params.y < 1 || params.y > this.#opts.grid[1]))
		)
			return console.error('Invalid coordinates');
		const startCoords = {x: (params.x || 1) * this.#opts.gridSquareSize, y: (params.y || 1) * this.#opts.gridSquareSize};
		const block = {
			el: document.createElementNS(ns, 'circle'),
			id,
			x: startCoords.x,
			y: startCoords.y,
			joinTo: {},
			data: params.data || {},
		};
		block.el.obj = block;
		block.el.classList.add(...['block', 'block-'+urlify(id), !params.class ? [] : params.class.split(' ')].flat());
        block.el.setAttribute('cx', block.x);
        block.el.setAttribute('cy', block.y);
		block.el.setAttribute('id', id);
		['click', 'hover'].forEach(evtType => {
			const nativeEvt = evtType == 'click' ? evtType : 'mouseenter';
			block.el.addEventListener(nativeEvt, evt => {
				if (evtType == 'click' && this.#dragHappened) return;
				this.#events.forEach(obj => obj.evt == evtType && obj.cb(evt, block))
			})
		});
		this.#canvases.blocks.appendChild(block.el);
		this.#blocks.push(block);
	}

	/* ---
	| REMOVE BLOCK - remove a block from the grid. Args:
	|	$id (str)	- the block ID
	--- */

	removeBlock(id) {
		const index = this.#blocks.findIndex(block => block.id == id);
		if (!index) return console.error(`No such block, "${id}"`);
		this.#blocks[index].el.remove();
		this.#blocks.splice(index, 1);
		this.#blocks.forEach(block => block.joinTo.includes(id) && block.joinTo.splice(block.joinTo.indexOf(id), 1));
		this.#joints.forEach((obj, i) => {
			if (obj.between.includes(id)) {
				obj.el.remove();
				this.#joints.splice(i, 1);
			}
		});
		this.#joinUp();
	}


	/* ---
	| CONNECT - connect two or more blocks to a route (user-defined or default). Args:
	|	$blocks (arr)	- array of two or more block IDs, each of which will be connected along $route
	|	$route (str) 	- the route name (default route if omitted)
	--- */

	connect(blocks, route = 'default') {
		if (!(blocks.length >= 2)) return console.error('Two or more block IDs must be passed');
		let blocksSet = new Set(blocks || []);
		if (blocksSet.size < blocks.length) return console.error('Only unique block IDs must be passed');
		const blockObjs = this.#blocks.filter(block => blocks.includes(block.id));
		if (blockObjs.length !== blocks.length) return console.error('One or more specified blocks do not exist');
		blocks.forEach((blockId, i) => {
			const blockObj = blockObjs.find(block => block.id == blockId);
			blockObj.el.classList.add('route-'+urlify(route));
			blockObj.joinTo[route] = blockObj.joinTo[route] || [];
			if (i < blocks.length-1 && !blockObj.joinTo[route].find(rel => rel.to == blocks[i+1]))
				blockObj.joinTo[route].push({to: blocks[i+1]});
			if (i && !blockObj.joinTo[route].find(rel => rel.from == blocks[i-1]))
				blockObj.joinTo[route].push({from: blocks[i-1]});
		});
		this.#joinUp('connect');
	}

	/* ---
	| GET ROUTE - get the blocks of a given route. Args:
	|	$route (str)	- the route name
	--- */

	getRoute(route) {
		return this.#blocks.filter(block => Object.keys(block.joinTo).includes(route));
	}

	/* ---
	| HIGHLIGHT ROUTE - highlight a route that was previously defined via addRoute(). Unhighlight by passing no args. Args:
	|	$route (str) 	- the name of the route to highlight
	--- */

	highlightRoute(route) {
		this.#el.classList.remove('showing-highlighted-route');
		[...this.#blocks, ...this.#connectors, ...this.#joints].forEach(obj => {
			obj.onHighlightedRoute = false;
			obj.el.classList.remove('is-on-highlighted-route');
		});
		if (!route) return;
		[
			...this.#blocks.filter(obj => obj.routes.includes(route)),
			[...this.#joints, ...this.#connectors].filter(obj => obj.routes.includes(route)),
		].flat().forEach(obj => {
			obj.el.classList.add('is-on-highlighted-route');
			obj.onHighlightedRoute = true;
		});
		this.#highlightedRoute = name;
		this.#el.classList.add('showing-highlighted-route');
	}

	/* ---
	| ON <X> - register an event on a block. Args:
	|	$evt (str)	- 'click', 'hover', 'dragStart', 'drag', 'dragEnd'
	|	$cb (func)		- the callback
	--- */

	on(evt, cb) {
		this.#events.push({evt, cb});
	}

	/* ---
	| GET BLOCK - get a block by its ID. Args:
	|	$id (str) 	- obv.
	--- */

	getBlock(id) {
		const block = this.#blocks.find(block => block.id == id);
		if (!block) return console.error(`No such block, "${id}"`);
		return block;
	}

	/* ---
	| EXPORT - export all data, for future reimport
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