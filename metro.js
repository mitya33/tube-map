//prep
const defaults = {
	showGrid: 1,
	snapToGrid: 1,
	snapResolution: .5,
	jointsMode: 0,
	gridSquareSize: 60,
	grid: [13, 7],
	dragMode: 1
};
const ns = 'http://www.w3.org/2000/svg';
const urlify = str => str.toLowerCase().replace(/\W/g, '-').replace(/-{2,}/g, '-');

//class
export class Metro {

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
		this.#el.style.position = 'relative';
		this.#el.innerHTML = '';
		this.#el.className = '';
		this.#el.classList.add(
			'metro',
			'joints-mode-'+this.#opts.jointsMode,
			'drag-mode-'+this.#opts.dragMode
		);

		//add elements
		this.#el.innerHTML = `
			<div class='metro-canvas blocks'></div>
			<svg class='metro-canvas connectors'></svg>
			<svg class='metro-canvas grid'></svg>
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
			const block = evt.target.closest('.blocks > *');
			if (!block) return;
			this.#dragging = block;
			block.classList.add('dragging');
			this.#offset = {
				x: evt.pageX - this.#el.offsetLeft - parseInt(this.#dragging.style.left),
				y: evt.pageY - this.#el.offsetTop - parseInt(this.#dragging.style.top)
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
			this.#opts.snapToGrid && ['x', 'y'].forEach(which => {
				const gridSquareSize = this.#opts.gridSquareSize * this.#opts.snapResolution;
				coords[which] = (Math.round(coords[which] / gridSquareSize) * gridSquareSize)
			});
			['x', 'y'].forEach(which => {
				this.#dragging.obj[which] = coords[which];
				this.#dragging.style[which == 'x' ? 'left' : 'top'] = coords[which]+'px';
			});
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
		[...this.#canvases.connectors.querySelectorAll('g'), ...this.#connectors].forEach(obj => (obj.el || obj).remove());
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
				const joint =
					prevJoints.find(obj => obj.between.includes(targetBlockId) && obj.between.includes(block.id)) ||
					{id: this.#joints.length, between: [block.id, targetBlockId]};
				joint.routes = routes;
				joint.el = document.createElement('div');
				joint.el.classList.add('joint', ...[...joint.routes].map(route => 'route-'+urlify(route)));
				joint.onHighlightedRoute && joint.el.classList.add('is-on-highlighted-route');
				joint.el.obj = joint;
				['x', 'y'].forEach(which => joint[which] = !joint[which] ?
					Math.min(block[which], targetBlock.obj[which]) + (Math.abs(block[which] - targetBlock.obj[which]) / 2) :
					joint[which]
				);
				this.#opts.snapToGrid && ['x', 'y'].forEach(which => {
					const gridSquareSize = this.#opts.gridSquareSize * this.#opts.snapResolution;
					joint[which] = (Math.round(joint[which] / gridSquareSize) * gridSquareSize)
				});
				['x', 'y'].forEach(which => joint.el.style[which == 'x' ? 'left' : 'top'] = joint[which]+'px');
				this.#canvases.blocks.appendChild(joint.el);
				this.#joints.push(joint);
			})
		});

		//connectors - joints enabled: connect blocks to intermediary joint
		this.#opts.jointsMode && this.#joints.forEach(joint => {
			let g = {};
			joint.routes.forEach(route => {
				joint.between.forEach(blockId => {
					const block = this.#canvases.blocks.querySelector('#'+blockId);
					if (!g[block.id]) {
						g[block.id] = document.createElementNS(ns, 'g');
						this.#canvases.connectors.appendChild(g[block.id]);
					}
					const angle = getAngle(block.obj.x - joint.x, block.obj.y - joint.y);
					setGroup(g[block.id], joint, angle);
					const lineLen = Math.hypot(joint.x - block.obj.x, joint.y - block.obj.y);
					shared.call(this, block, joint, lineLen, route, g[block.id]);
				})
			})
		});

		//connectors - joints disabled: connect directly between blocks)
		!this.#opts.jointsMode && this.#blocks.forEach(block => {
			const g = {}
			Object.keys(block.joinTo).forEach(route => {
				block.joinTo[route].filter(rel => rel.to).forEach(rel => {
					if (!g[rel.to]) {
						g[rel.to] = document.createElementNS(ns, 'g');
						this.#canvases.connectors.appendChild(g[rel.to]);
					}
					const targetBlock = this.#canvases.blocks.querySelector('#'+rel.to);
					const angle = getAngle(targetBlock.obj.x - block.x, targetBlock.obj.y - block.y);
					setGroup(g[rel.to], block, angle);
					const lineLen = Math.hypot(block.x - targetBlock.obj.x, block.y - targetBlock.obj.y);
					shared.call(this, block, targetBlock.obj, lineLen, route, g[rel.to]);
				})
			})
		});

		//connectors - shared logic by both above routes i.e. using and not using joints)
		function shared(block, jointOrTargetBlock, lineLen, route, group) {
			const line = document.createElementNS(ns, 'line');
			const connector = {from: block.id, to: jointOrTargetBlock.id, route};
			connector.el = line;
			line.classList.add('route-'+urlify(connector.route));
			connector.onHighlightedRoute && line.classList.add('is-on-highlighted-route');
			this.#connectors.push(connector);
			const curve = makeCurve(lineLen, group, Object.keys((block.obj || block).joinTo).length);
			curve.classList.add('route-'+urlify(connector.route));
			group.appendChild(curve);
		}
		function getAngle(x, y){
		    const angle = Math.atan2(y, x) / Math.PI*180;
		    return (360+Math.round(angle)) % 360;
		}
		function setGroup(group, xy, angle) {
			group.setAttribute('transform', `translate(${xy.x}, ${xy.y}) rotate(${angle})`);
		}
		function makeCurve(x2, group, numRoutes) {
			const mpx = x2 * 0.5;
			const theta = Math.atan2(0, x2) - Math.PI / 2;
			let offset = !(group.children.length % 2) ? (group.children.length+1) * -10 : (group.children.length+1) * 10;
			if (numRoutes == 1) offset = 0;
			const controlPoint = {x: mpx + offset * Math.cos(theta), y: offset * Math.sin(theta)};
		  	const path = document.createElementNS(ns, 'path');
		  	path.setAttribute('fill', 'transparent');
			path.setAttribute('d', `M0 0 Q${controlPoint.x} ${controlPoint.y} ${x2} 0`);
			return path;
		}

	}

	//API methods...

	/* ---
	| ADD BLOCK - add a block to the grid. Args:
	|	$id (str; optnl)		- an ID for this block (defaults to "block-0", "block-1" etc.)
	|	$params (obj; optnl)	- including:
	|		$x (int)			- X position or grid point (if using grid), otherwise defaults to square 1/1
	|		$y (int) 			- Y " " "
	|		$data (obj)			- object of meta data to store on the block
	|		$class (str)		- CSS class(es) to add to the block
	|		$content (str; el)	- a HTML string	 or HTML element reference to insert into the block, as content. If omitted,
	|							  $id will be used
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
			el: document.createElement('div'),
			id,
			x: startCoords.x,
			y: startCoords.y,
			joinTo: {},
			data: params.data || {},
		};
		block.el.obj = block;
		const content = document.createElement('div');
		content.classList.add('content');
		block.el.appendChild(content);
		if (!params.content) params.content = params.id;
		if (typeof params.content == 'object') content.appendChild(params.content);
		if (typeof params.content == 'string') content.innerHTML = params.content;
		block.el.classList.add(...['block', 'block-'+urlify(id), !params.class ? [] : params.class.split(' ')].flat());
        block.el.style.left = block.x+'px';
        block.el.style.top = block.y+'px';
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