/**
 * MDX parser.
 *
 * @author ZitRo
 * @constructor
 */
var MDXParser = function () {};

/**
 * Debug method.
 *
 * @param {string} mdx
 * @param {string} [message]
 * @private
 */
MDXParser.prototype._warnMDX = function (mdx, message) {
    console.warn("MDX is not parsed:\n\n%s\n\n" + (message ? "(" + message + ")" : ""), mdx);
};

/**
 * Converts filter to setExpression that can be inserted to MDX.
 *
 * @param filterSpec
 */
MDXParser.prototype.makeSetExpressionFromFilter = function (filterSpec) {
    if (filterSpec.match(/^\([^\),]*,[^\)]*\)$/)) {
        return "NONEMPTYCROSSJOIN" + filterSpec.slice(0, filterSpec.length - 1) + ".children)";
    } else {
        return filterSpec + ".children";
    }
};

/**
 * If expression has no "NON EMPTY" it will be prepended.
 * @param expression
 */
MDXParser.prototype.prependNonEmpty = function (expression) {
    return expression.match(/^\s*non\s+empty/i) ? expression : "NON EMPTY " + expression;
};

/**
 * Applies Row Count to mdx.
 * Source: SELECT [Test].Members ON 0, NON EMPTY      [Test2].Members     ON 1 FROM [Tests] %FILTER
 * Out:    SELECT [Test].Members ON 0, NON EMPTY HEAD([Test2].Members, N) ON 1 FROM [Tests] %FILTER
 * @param {string} expression - MDX expression.
 * @param {number} n - Number of rows to return.
 * @returns {string}
 */
MDXParser.prototype.applyRowCount = function (expression, n) {
    return expression.replace(/\s*on\s*0\s*,\s*(?:non\s*empty\s*)?(.*)\s*on\s*1/i, function (a,b) {
        return typeof n !== "undefined" ? " ON 0, NON EMPTY HEAD(" + b + ", " + n + ") ON 1" : a;
    });
};

/**
 * Performs DrillDown on MDX query.
 * @param {string} mdx
 * @param {string} filter
 * @param {string} [expression] - if is set, "* ON 1" will be replaced with "{value} ON 1"
 * @returns {string} - new query.
 */
MDXParser.prototype.drillDown = function (mdx, filter, expression) {

    if (!filter) {
        if (/]\s+ON\s+1/i.test(mdx)) {
            return mdx = mdx.replace(/]\s+ON\s+1/i, "].children ON 1");
        } else {
            this._warnMDX(mdx, "no filter specified");
            return "";
        }
    }

    var parts = mdx.split(/(select\s*)(.*?)(\s*from)/ig); // split by SELECT queries

    if (parts.length < 4) {
        this._warnMDX(mdx);
        return ""; // no select query matched
    }

    var selectBody = parts[parts.length - 3],
        dimensions = selectBody.split(/(\s*ON\s*[01]\s*,?\s*)/i);

    if (dimensions.length < 2) {
        this._warnMDX(mdx, "DrillDown is impossible");
        return ""; // no dimensions matched
    }

    var index = -1;
    dimensions.map(function(e,i){if(e.match(/\s*ON\s*[01]\s*,?\s*/i)) index=i-1; return e;});

    if (index === -1) {
        this._warnMDX(mdx, "DrillDown is impossible");
        return ""; // DrillDown is impossible (no "1" dimension)
    }

    dimensions[index] =
        this.prependNonEmpty(expression || this.makeSetExpressionFromFilter(filter));
    for (var i in dimensions) {
        if (dimensions[i].length === 1) { // "0" || "1"
            dimensions[i](parseInt(i), 1);
        }
    }
    parts[parts.length - 3] = dimensions.join("");

    return this.applyFilter(parts.join(""), filter);

};

/**
 * @param {string} basicMDX
 * @param {string[]} [filters]
 */
MDXParser.prototype.drillThrough = function (basicMDX, filters) {

    var cubeAndFilters = basicMDX.slice(basicMDX.lastIndexOf("FROM ")),
        query = "DRILLTHROUGH SELECT " + cubeAndFilters;

    for (var i in filters) {
        query = this.applyFilter(query, filters[i]);
    }

    return query;

};

/**
 * Returns type of MDX.
 *
 * @param {string} mdx
 */
MDXParser.prototype.mdxType = function (mdx) {

    var m = mdx.toLowerCase(),
        dt = m.indexOf("drillthrough"),
        dd = m.indexOf("select");

    if (dt > -1) {
        return "drillthrough";
    } else if (dd > -1) {
        return "mdx";
    } else {
        return "unknown";
    }

};

/**
 * @param {string} basicMDX
 * @param {string} filterSpec
 */
MDXParser.prototype.applyFilter = function (basicMDX, filterSpec) {

    return basicMDX + (filterSpec ? " %FILTER " + filterSpec : "");

};