const defaults = {
	showGrid: 1,
	snapBlocks: 1,
	doJoints: 1,
	snapJoints: 1,
	gridSquareSize: 60,
	lineAnimSteps: 20,
	lineAnimSpeed: .6, //ms per frame
	grid: [13, 7]
};
const ns = 'http://www.w3.org/2000/svg';
const showRouteClass = 'show-route';
const enRouteClass = 'en-route';

export class TubeMap {

	#el;
	#canvases
	#opts;
	#blocks;
	#connectors;
	#joints;
	#dragging;
	#offset;
	#routeSteps;

	/* ---
	| SETUP - args:
	|	$el (str)	- a selector string targeting a container element
	|	$opts (obj)	- an object of params - gets merged into $defaults
	--- */

	constructor(el, opts = {}) {
		this.#el = document.querySelector(el);
		this.#opts = Object.assign(opts, defaults);
		this.#blocks = [];
		this.#connectors = [];
		this.#joints = [];
		this.#dragging = null;
		this.#offset = null;
		this.#buildCanvas();
		this.#dragDrop();
	}

	/* ---
	| BUILD CANVAS
	--- */

	#buildCanvas() {

		this.#el.classList.add('tube-map');

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
			this.#offset = {
				x: evt.pageX - this.#el.offsetLeft - this.#dragging.getAttribute('cx'),
				y: evt.pageY - this.#el.offsetTop - this.#dragging.getAttribute('cy')
			};
		});
		document.body.addEventListener('mouseup', evt => this.#dragging = null);
		this.#canvases.blocks.addEventListener('mousemove', evt => {
			if (!this.#dragging) return;
			const coords = {
				x: evt.pageX - this.#el.offsetLeft - this.#offset.x,
				y: evt.pageY - this.#el.offsetTop - this.#offset.y
			};
			this.#opts.snapBlocks && ['x', 'y'].forEach(which =>
				coords[which] = (Math.round(coords[which] / this.#opts.gridSquareSize) * this.#opts.gridSquareSize)
			);
			['x', 'y'].forEach(which => this.#dragging.setAttribute('c'+which, this.#dragging.obj[which] = coords[which]));
			this.#joinUp(this.#dragging.matches('.block') ? 'dragBlock' : 'dragJoint', this.#dragging);
			this.showRoute(this.#routeSteps);
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
		this.#connectors.forEach(obj => obj.el.remove());
		this.#connectors = [];
		if (trigger == 'addRel') {
			this.#joints.forEach(obj => obj.el.remove());
			this.#joints = [];
		}

		//joints - redrawn only if relationships changed, and those already extant stay unmoved...
		this.#opts.doJoints && trigger == 'addRel' && this.#blocks.forEach((block, i) =>
			block.joinTo.forEach(targetBlockId => {
				const targetBlock = this.#canvases.blocks.querySelector('#'+targetBlockId);
				const prevJoint = prevJoints.find(obj =>
					obj.between.includes(targetBlockId) && obj.between.includes(block.id)
				);
				const joint = prevJoint || {between: [block.id, targetBlockId]};
				joint.el = document.createElementNS(ns, 'circle');
				this.#opts.onClickJoint && joint.el.addEventListener('click', evt =>
					this.#opts.onClickJoint(evt, joint.between.map(blockId => blockId))
				);
				joint.el.classList.add('joint');
				joint.el.obj = joint;
				['x', 'y'].forEach(which => joint[which] = !prevJoint ?
					Math.min(block[which], targetBlock.obj[which]) + (Math.abs(block[which] - targetBlock.obj[which]) / 2) :
					prevJoint[which]
				);
				this.#opts.snapJoints && ['x', 'y'].forEach(which =>
					joint[which] = (Math.round(joint[which] / this.#opts.gridSquareSize) * this.#opts.gridSquareSize)
				);
				['x', 'y'].forEach(which => joint.el.setAttribute('c'+which, joint[which]));

				//...add - if animating connectors and wasn't here already, wait for that
				const addEl = () => this.#canvases.blocks.appendChild(joint.el);
				!prevJoint ?
					setTimeout( addEl, (this.#opts.lineAnimSpeed * this.#opts.lineAnimSteps) + this.#opts.lineAnimSpeed) :
					addEl();
				this.#joints.push(joint);
			})
		);

		//connectors (joints enabled - connect blocks to midway joint)...
		this.#opts.doJoints && this.#joints.forEach(joint => 
			joint.between.forEach(blockId => {
				const isPrevJoint = !!prevJoints.find(prevJoint => prevJoint.x === joint.x && prevJoint.y == joint.y);
				const block = this.#canvases.blocks.querySelector('#'+blockId);
				const line = document.createElementNS(ns, 'line');
				const connector = {el: line, block: block.obj, joint};
				this.#canvases.connectors.appendChild(line);
				this.#connectors.push(connector);

				//...animate, if enabled and is new connector
				if (this.#dragging || this.#opts.lineAnimSteps === 1 || isPrevJoint) {
					line.setAttribute('x1', block.obj.x);
					line.setAttribute('x2', joint.x);
					line.setAttribute('y1', block.obj.y);
					line.setAttribute('y2', joint.y);
				} else {
					let i=1;
					let int = setInterval(() => {
						line.setAttribute('x1', block.obj.x);
						line.setAttribute('x2', block.obj.x + (((joint.x - block.obj.x) / this.#opts.lineAnimSteps)) * i);
						line.setAttribute('y1', block.obj.y);
						line.setAttribute('y2', block.obj.y + (((joint.y - block.obj.y) / this.#opts.lineAnimSteps)) * i);
						i == this.#opts.lineAnimSteps && clearInterval(int);
						i++;
					}, this.#opts.lineAnimSpeed);
				}
			})
		);

		//connectors (joints disabled - connect directly between blocks)
		!this.#opts.doJoints && this.#blocks.forEach(block =>
			block.joinTo.forEach(targetBlockId => {
				const line = document.createElementNS(ns, 'line');
				const targetBlock = this.#canvases.blocks.querySelector('#'+targetBlockId);
				this.#canvases.connectors.appendChild(line);
				this.#connectors.push({el: line, block: block, joint: targetBlock.obj});
				line.setAttribute('x1', block.x);
				line.setAttribute('x2', targetBlock.obj.x);
				line.setAttribute('y1', block.y);
				line.setAttribute('y2', targetBlock.obj.y);
			})
		);

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
			return console.log('Invalid coordinates');
		const mult = (this.#opts.snapBlocks ? this.#opts.gridSquareSize : 1);
		const startCoords = {x: (params.x || 1) * mult, y: (params.y || 1) * mult};
		const block = {
			el: document.createElementNS(ns, 'circle'),
			id,
			x: startCoords.x,
			y: startCoords.y,
			joinTo: [],
			data: params.data || {}
		};
		block.el.obj = block;
		this.#opts.onClickBlock && block.el.addEventListener('click', evt =>
			this.#opts.onClickBlock(evt, {id, ...block.data})
		);
		block.el.classList.add.apply(block.el.classList, ['block', ...(!params.class ? [] : params.class.split(' '))]);
		if (params.color) block.el.style.fill = params.color;
        block.el.setAttribute('cx', block.x);
        block.el.setAttribute('cy', block.y);
		block.el.setAttribute('id', id);
		this.#canvases.blocks.appendChild(block.el);
		this.#blocks.push(block);
	}

	/* ---
	| API: SHOW ROUTE - highlight a given route via a sequence of blocks. Call with no args to turn off. Args:
	|	$steps (arr) 	- array of block IDs along the route
	--- */

	showRoute(steps) {
		this.#el.classList.remove(showRouteClass);
		[...this.#blocks, ...this.#connectors, ...this.#joints].forEach(obj => {
			obj.enRoute = false;
			obj.el.classList.remove(enRouteClass);
		});
		if (!steps) return;
		if (steps.find(blockId => !this.#blocks.find(block => block.id == blockId)))
			return console.error('Steps array references one or more invalid block IDs');
		this.#routeSteps = steps;
		this.#blocks.filter(block => steps.includes(block.id)).forEach(block => {
			block.enRoute = 1;
			block.el.classList.add(enRouteClass);
		});
		this.#connectors.filter(obj => steps.includes(obj.block.id) || steps.includes(obj.joint.id)).forEach(obj => {
			obj.enRoute = 1;
			obj.el.classList.add(enRouteClass);
		});
		this.#joints.filter(obj => steps.includes(obj.between[0]) || steps.includes(obj.between[1])).forEach(obj => {
			obj.enRoute = 1;
			obj.el.classList.add(enRouteClass);
		});
		this.#el.classList.add(showRouteClass);
	}

}