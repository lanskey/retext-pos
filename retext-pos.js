(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.retextPOS = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * @author Titus Wormer
 * @copyright 2014-2015 Titus Wormer
 * @license MIT
 * @module retext:pos
 * @fileoverview Retext part-of-speech (POS) tagger.
 */

'use strict';

/*
 * Dependencies.
 */

var visit = require('unist-util-visit');
var nlcstToString = require('nlcst-to-string');
var posjs = require('pos-js');


/*
 * Constants.
 */

var tagger = new posjs.Tagger();

/**
 * Patch a `partOfSpeech` property on `node`s.
 *
 * @param {NLCSTNode} node - Node.
 * @param {string} tag - Part-of-speech tag as returned
 *   by pos-js.
 */
function patch(node, tag) {
    var data = node.data || {};

    data.partOfSpeech = tag;

    node.data = data;
}

/**
 * Factory to gather parents and patch them based on their
 * childrens directionality.
 *
 * @return {function(node, index, parent)} - Can be passed
 *   to `visit`.
 */
function concatenateFactory() {
    var queue = [];

    /**
     * Gather a parent if not already gathered.
     *
     * @param {NLCSTWordNode} node - Word.
     * @param {number} index - Position of `node` in
     *   `parent`.
     * @param {NLCSTParentNode} parent - Parent of `child`.
     */
    function concatenate(node, index, parent) {
        if (parent && queue.indexOf(parent) === -1) {
            queue.push(parent);
        }
    }

    /**
     * Patch all words in `parent`.
     *
     * @param {NLCSTParentNode} node - Parent
     */
    function one(node) {
        var children = node.children;
        var length = children.length;
        var index = -1;
        var values = [];
        var words = [];
        var child;
        var tags;

        while (++index < length) {
            child = children[index];

            if (child.type === 'WordNode') {
                values.push(nlcstToString(child));
                words.push(child);
            }
        }

        tags = tagger.tag(values);
        index = -1;
        length = tags.length;

        while (++index < length) {
            patch(words[index], tags[index][1]);
        }
    }

    /**
     * Patch all parents.
     */
    function done() {
        var length = queue.length;
        var index = -1;

        while (++index < length) {
            one(queue[index]);
        }
    }

    concatenate.done = done;

    return concatenate;
}

/**
 * Patch `stem` on each node.
 *
 * @param {NLCSTNode} cst - Syntax tree.
 */
function transformer(cst) {
    var concatenate = concatenateFactory();

    visit(cst, 'WordNode', concatenate);

    concatenate.done();
}

/**
 * Define `metaphone`.
 *
 * @return {Function} - `transformer`.
 */
function attacher() {
    return transformer;
}

/*
 * Expose `metaphone`.
 */

module.exports = attacher;

},{"nlcst-to-string":2,"pos-js":undefined,"unist-util-visit":3}],2:[function(require,module,exports){
'use strict';

/**
 * Stringify an NLCST node.
 *
 * @param {NLCSTNode} nlcst
 * @return {string}
 */
function nlcstToString(nlcst) {
    var values,
        length,
        children;

    if (typeof nlcst.value === 'string') {
        return nlcst.value;
    }

    children = nlcst.children;
    length = children.length;

    /**
     * Shortcut: This is pretty common, and a small performance win.
     */

    if (length === 1 && 'value' in children[0]) {
        return children[0].value;
    }

    values = [];

    while (length--) {
        values[length] = nlcstToString(children[length]);
    }

    return values.join('');
}

/*
 * Expose `nlcstToString`.
 */

module.exports = nlcstToString;

},{}],3:[function(require,module,exports){
/**
 * @author Titus Wormer
 * @copyright 2015 Titus Wormer
 * @license MIT
 * @module unist:util:visit
 * @fileoverview Recursively walk over unist nodes.
 */

'use strict';

/* eslint-env commonjs */

/**
 * Visit.
 *
 * @param {Node} tree - Root node
 * @param {string} [type] - Node type.
 * @param {function(node): boolean?} visitor - Invoked
 *   with each found node.  Can return `false` to stop.
 * @param {boolean} [reverse] - By default, `visit` will
 *   walk forwards, when `reverse` is `true`, `visit`
 *   walks backwards.
 */
function visit(tree, type, visitor, reverse) {
    if (typeof type === 'function') {
        reverse = visitor;
        visitor = type;
        type = null;
    }

    /**
     * Visit children in `parent`.
     *
     * @param {Array.<Node>} children - Children of `node`.
     * @param {Node?} parent - Parent of `node`.
     * @return {boolean?} - `false` if the visiting stopped.
     */
    function all(children, parent) {
        var step = reverse ? -1 : 1;
        var max = children.length;
        var min = -1;
        var index = (reverse ? max : min) + step;
        var child;

        while (index > min && index < max) {
            child = children[index];

            if (child && one(child, index, parent) === false) {
                return false;
            }

            index += step;
        }

        return true;
    }

    /**
     * Visit a single node.
     *
     * @param {Node} node - Node to visit.
     * @param {number?} [index] - Position of `node` in `parent`.
     * @param {Node?} [parent] - Parent of `node`.
     * @return {boolean?} - A result of invoking `visitor`.
     */
    function one(node, index, parent) {
        var result;

        index = index || (parent ? 0 : null);

        if (!type || node.type === type) {
            result = visitor(node, index, parent || null);
        }

        if (node.children && result !== false) {
            return all(node.children, node);
        }

        return result;
    }

    one(tree);
}

/*
 * Expose.
 */

module.exports = visit;

},{}]},{},[1])(1)
});